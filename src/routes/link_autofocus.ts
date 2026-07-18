// One-shot signal connecting link creation (ToggleLinkCommand) to the link
// popover (LinkActionOverlay): set when a fresh link is created from the
// toolbar, consumed exactly once to focus the popover's URL input.
//
// The intent is passed explicitly instead of inferring it from mount state
// ("href is empty"): a mount-state heuristic re-fires on unrelated
// re-mounts and steals focus back from the canvas — the focus race found
// in PR #349 review.
let autofocus_requested = false;

export function request_link_autofocus() {
	autofocus_requested = true;
}

export function consume_link_autofocus(): boolean {
	const was_requested = autofocus_requested;
	autofocus_requested = false;
	return was_requested;
}
