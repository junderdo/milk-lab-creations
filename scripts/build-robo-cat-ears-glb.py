#!/usr/bin/env python3
"""Build the rigged robo-cat-ears glTF (.glb) from the CAD STL exports.

Source STLs (Windows): C:\\Users\\jeffu\\Projects\\cat-ears-3d-print\\3d exports for animation editor
Output: apps/web/static/models/robo-cat-ears.glb

Rig (matches firmware channel map in robo-cat-ears/main/servo.h):
  Headband (static)
    EarL_Azimuth  (channel 0)  -> ServosL mesh + EarL_Latitude (channel 1) -> EarL mesh
    EarR_Azimuth  (channel 2)  -> ServosR mesh + EarR_Latitude (channel 3) -> EarR mesh

Each articulation node carries glTF extras (three.js userData):
  { "channel": n, "axis": [x,y,z], "neutralDeg": 90 }
axis is the rotation axis in the node's parent space (unit vector, glTF Y-up).
Runtime pose: quaternion = axisAngle(axis, sign * radians(angleDeg - 90)).
Rotation signs must be validated visually (prototype ticket) — firmware semantics:
  ch0: 40 = left ear swivels leftward/outboard   ch2: 140 = right ear rightward/outboard
  ch1: 80 = left ear tilts up                    ch3: 100 = right ear tilts up

Pivot axes are recovered by cylinder-fitting the MG90S rounded case ends
(r = 6.05 mm), which are coaxial with the output shafts.

Usage: python scripts/build-robo-cat-ears-glb.py <stl-dir> [out.glb]
Deps: pip install trimesh numpy pygltflib fast-simplification
"""
import sys
import numpy as np
import trimesh
import fast_simplification
from pygltflib import (
    GLTF2, Scene, Node, Mesh, Primitive, Attributes, Accessor, BufferView,
    Buffer, Material, PbrMetallicRoughness, BufferFormat,
    ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, FLOAT, UNSIGNED_INT, SCALAR, VEC3,
)

STL_DIR = sys.argv[1] if len(sys.argv) > 1 else "/mnt/c/Users/jeffu/Projects/cat-ears-3d-print/3d exports for animation editor"
OUT = sys.argv[2] if len(sys.argv) > 2 else "apps/web/static/models/robo-cat-ears.glb"

SHAFT_R = 6.05          # MG90S rounded case end radius (mm), coaxial with output shaft
# servos raised from 4000: the assembly's small details (tabs, shafts, horns)
# read as butchered below ~12k faces in the editor preview
TARGET_FACES = {"headband": 9000, "servos": 12000, "ear": 11000}

# Manual pivot corrections dialed in visually against the physical robot in
# the Threlte preview prototype (left-side values, CAD mm Z-up; x mirrors per
# side): servo assembly pivots further back+up, ear pivots further up its
# length. glTF-space equivalents: azimuth (0, +12.5, -9.0), latitude
# (0, +1.0, +13.0) mm.
AZ_PIVOT_CORRECTION_MM = np.array([0.0, 9.0, 12.5])
LAT_PIVOT_CORRECTION_MM = np.array([0.0, -13.0, 1.0])


def load(name):
    return trimesh.load(f"{STL_DIR}/robo-cat-ears-{name}.stl")


def kasa_circle(P):
    A = np.c_[2 * P, np.ones(len(P))]
    sol, *_ = np.linalg.lstsq(A, (P ** 2).sum(1), rcond=None)
    c = sol[:2]
    return c, np.sqrt(sol[2] + c @ c)


def fit_shaft(mesh, seed_deg, window=15):
    """Fit a cylinder whose axis lies in the XZ plane near seed_deg (from +Z).

    Returns (unit axis dir, a point on the axis, axis-extent midpoint point).
    """
    fn, fc = mesh.face_normals, mesh.triangles_center
    Y = np.array([0.0, 1.0, 0.0])
    best = None
    for deg4 in range(int((seed_deg - window) * 4), int((seed_deg + window) * 4)):
        deg = deg4 / 4
        a = np.array([np.sin(np.radians(deg)), 0, np.cos(np.radians(deg))])
        b2 = np.cross(a, Y)
        sel = np.abs(fn @ a) < 0.02
        pts, nrm = fc[sel], fn[sel]
        if len(pts) < 40:
            continue
        P = np.stack([pts @ Y, pts @ b2], 1)
        N = np.stack([nrm @ Y, nrm @ b2], 1)
        c = P - SHAFT_R * N
        uniq, counts = np.unique(np.round(c), axis=0, return_counts=True)
        t = np.argmax(counts)
        near = np.linalg.norm(c - uniq[t], axis=1) < 1.5
        if near.sum() < 40:
            continue
        ctr, r = kasa_circle(P[near])
        resid = np.abs(np.linalg.norm(P[near] - ctr, axis=1) - r)
        inliers = int((resid < 0.12).sum())
        if best is None or inliers > best[0]:
            p3 = Y * ctr[0] + b2 * ctr[1]
            ext = pts[near] @ a
            best = (inliers, a, p3, float(ext.min()), float(ext.max()))
    _, a, p3, lo, hi = best
    return a, p3, p3 + a * (lo + hi) / 2


def intersect_in_xz(a_dir, a_pt, b_dir, b_pt):
    """Closest-approach parameters of two lines, solved in the XZ plane."""
    A = np.array([[a_dir[0], -b_dir[0]], [a_dir[2], -b_dir[2]]])
    rhs = np.array([b_pt[0] - a_pt[0], b_pt[2] - a_pt[2]])
    t, s = np.linalg.solve(A, rhs)
    return a_pt + t * a_dir, b_pt + s * b_dir


def decimate(mesh, target_faces):
    if len(mesh.faces) <= target_faces:
        return mesh
    v, f = fast_simplification.simplify(
        mesh.vertices.astype(np.float32), mesh.faces.astype(np.int64),
        target_count=target_faces)
    return trimesh.Trimesh(vertices=v, faces=f)


def to_yup(v):
    """CAD Z-up (mm) -> glTF Y-up (m): (x,y,z) -> (x, z, -y), mm -> m."""
    out = np.stack([v[:, 0], v[:, 2], -v[:, 1]], 1)
    return (out * 0.001).astype(np.float32)


def main():
    headband = load("headband")
    parts = {}
    for side in ("l", "r"):
        servos, ear = load(f"servos-{side}"), load(f"ear-{side}")
        sx = 1.0 if servos.centroid[0] > 0 else -1.0
        # The two shafts are orthogonal and both lie in the XZ plane; fit the two
        # cylinder families, then classify: sign-normalized to +Z, the azimuth
        # shaft points up-outboard (x toward the ear side), latitude up-inboard.
        cand = [fit_shaft(servos, 45), fit_shaft(servos, 135)]
        cand = [(-d, p, m) if d[2] < 0 else (d, p, m) for d, p, m in cand]
        cand.sort(key=lambda c: -c[0][0] * sx)
        (az_dir, az_pt, _), (lat_dir, lat_pt, _) = cand
        az_pivot, lat_pivot = intersect_in_xz(az_dir, az_pt, lat_dir, lat_pt)
        mirror = np.array([sx, 1.0, 1.0])
        az_pivot = az_pivot + AZ_PIVOT_CORRECTION_MM * mirror
        lat_pivot = lat_pivot + LAT_PIVOT_CORRECTION_MM * mirror
        # Point the latitude axis outboard along the band.
        if lat_dir[0] * sx < 0:
            lat_dir = -lat_dir
        parts[side] = dict(servos=servos, ear=ear, az_dir=az_dir, az_pivot=az_pivot,
                           lat_dir=lat_dir, lat_pivot=lat_pivot)
        print(f"{side}: azimuth axis {np.round(az_dir,4)} @ {np.round(az_pivot,2)} | "
              f"latitude axis {np.round(lat_dir,4)} @ {np.round(lat_pivot,2)}")

    # --- build glb ---------------------------------------------------------
    gltf = GLTF2(scene=0)
    blob = bytearray()

    def push(arr, target):
        arr = np.ascontiguousarray(arr)
        off = len(blob)
        blob.extend(arr.tobytes())
        while len(blob) % 4:
            blob.append(0)
        gltf.bufferViews.append(BufferView(buffer=0, byteOffset=off,
                                           byteLength=arr.nbytes, target=target))
        return len(gltf.bufferViews) - 1

    def add_mesh(name, mesh, origin_cad, material, kind):
        """Add mesh with vertices rebased to origin_cad, converted to Y-up meters."""
        m = decimate(mesh, TARGET_FACES[kind])
        m = trimesh.Trimesh(vertices=m.vertices - origin_cad, faces=m.faces)
        pos = to_yup(m.vertices)
        norm = to_yup(m.vertex_normals * 1000.0)  # direction only; undo the mm->m scale
        ln = np.linalg.norm(norm, axis=1, keepdims=True)
        ln[ln == 0] = 1.0
        norm /= ln
        idx = m.faces.astype(np.uint32).ravel()

        vi = push(pos, ARRAY_BUFFER)
        ni = push(norm, ARRAY_BUFFER)
        ii = push(idx, ELEMENT_ARRAY_BUFFER)
        gltf.accessors.append(Accessor(bufferView=vi, componentType=FLOAT, count=len(pos),
                                       type=VEC3, max=pos.max(0).tolist(), min=pos.min(0).tolist()))
        pa = len(gltf.accessors) - 1
        gltf.accessors.append(Accessor(bufferView=ni, componentType=FLOAT, count=len(norm), type=VEC3))
        na = len(gltf.accessors) - 1
        gltf.accessors.append(Accessor(bufferView=ii, componentType=UNSIGNED_INT, count=len(idx), type=SCALAR))
        ia = len(gltf.accessors) - 1
        gltf.meshes.append(Mesh(name=name, primitives=[Primitive(
            attributes=Attributes(POSITION=pa, NORMAL=na), indices=ia, material=material)]))
        return len(gltf.meshes) - 1

    gltf.materials = [
        Material(name="shell", pbrMetallicRoughness=PbrMetallicRoughness(
            baseColorFactor=[0.85, 0.83, 0.88, 1.0], metallicFactor=0.0, roughnessFactor=0.6)),
        Material(name="servo", pbrMetallicRoughness=PbrMetallicRoughness(
            baseColorFactor=[0.25, 0.28, 0.55, 1.0], metallicFactor=0.1, roughnessFactor=0.5)),
    ]

    def yup_pt(p):
        return [p[0] * 0.001, p[2] * 0.001, -p[1] * 0.001]

    def yup_dir(d):
        v = np.array([d[0], d[2], -d[1]])
        return (v / np.linalg.norm(v)).round(6).tolist()

    nodes = []
    hb_mesh = add_mesh("Headband", headband, np.zeros(3), 0, "headband")
    nodes.append(Node(name="Headband", mesh=hb_mesh))

    for side, chans in (("l", (0, 1)), ("r", (2, 3))):
        p = parts[side]
        S = side.upper()
        servo_mesh = add_mesh(f"Servos{S}", p["servos"], p["az_pivot"], 1, "servos")
        ear_mesh = add_mesh(f"Ear{S}", p["ear"], p["lat_pivot"], 0, "ear")
        servo_node = Node(name=f"Servos{S}", mesh=servo_mesh)
        ear_node = Node(name=f"Ear{S}", mesh=ear_mesh)
        base = len(nodes)
        nodes.append(servo_node)                      # base
        nodes.append(ear_node)                        # base+1
        lat_rel = p["lat_pivot"] - p["az_pivot"]
        nodes.append(Node(name=f"Ear{S}_Latitude", translation=yup_pt(lat_rel),
                          children=[base + 1],
                          extras={"channel": chans[1], "axis": yup_dir(p["lat_dir"]),
                                  "neutralDeg": 90}))  # base+2
        nodes.append(Node(name=f"Ear{S}_Azimuth", translation=yup_pt(p["az_pivot"]),
                          children=[base, base + 2],
                          extras={"channel": chans[0], "axis": yup_dir(p["az_dir"]),
                                  "neutralDeg": 90}))  # base+3

    gltf.nodes = nodes
    roots = [0] + [i for i, n in enumerate(nodes) if n.name.endswith("_Azimuth")]
    gltf.scenes = [Scene(name="RoboCatEars", nodes=roots)]
    gltf.buffers = [Buffer(byteLength=len(blob))]
    gltf.set_binary_blob(bytes(blob))
    gltf.convert_buffers(BufferFormat.BINARYBLOB)
    gltf.save_binary(OUT)
    total_faces = sum(gltf.accessors[m.primitives[0].indices].count // 3 for m in gltf.meshes)
    print(f"wrote {OUT}: {len(gltf.meshes)} meshes, {total_faces} faces, {len(blob)} bytes buffer")


if __name__ == "__main__":
    main()
