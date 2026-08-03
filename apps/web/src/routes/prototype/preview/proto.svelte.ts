// PROTOTYPE — shared playback state between the controls page and the Threlte scene.
export type NodeName = 'EarL_Azimuth' | 'EarL_Latitude' | 'EarR_Azimuth' | 'EarR_Latitude';

export const NODE_NAMES: NodeName[] = [
	'EarL_Azimuth',
	'EarL_Latitude',
	'EarR_Azimuth',
	'EarR_Latitude'
];

export class PlaybackState {
	payloadKey = $state('showcase');
	t = $state(0); // ms into the animation
	playing = $state(false);
	loop = $state(true);
	speed = $state(1);
	/** Per-node rotation sign — the thing this prototype exists to validate. */
	signs = $state<Record<NodeName, 1 | -1>>({
		EarL_Azimuth: 1,
		EarL_Latitude: 1,
		EarR_Azimuth: 1,
		EarR_Latitude: 1
	});

	// written by the scene every frame
	angles = $state<[number, number, number, number]>([90, 90, 90, 90]);
	fps = $state(0);
	worstFrameMs = $state(0);
	modelStatus = $state('loading…');
}
