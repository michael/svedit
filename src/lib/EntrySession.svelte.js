export default class EntrySession {
	current = $state();
	history = $state();
  future = $state();

  constructor(entry) {
    this.current = entry;
    this.history = [];
    this.future = [];
  }

  get(path) {
    let current = this.current;
    for (let key of path) {
      if (current == null) {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }

  set(path, value) {
    // Clone current state for history before updating
    const history_copy = structuredClone($state.snapshot(this.current));

    if (path.length === 0) {
      return value;
    }
  
    let current = this.current;
    for (let i = 0; i < path.length - 1; i++) {
      if (current[path[i]] === undefined) {
        current[path[i]] = typeof path[i + 1] === 'number' ? [] : {};
      }
      current = current[path[i]];
    }
  
    current[path[path.length - 1]] = value;

    this.history = [...this.history, history_copy];
    this.future = [];

    return current;
  }

  insert_text(path, selection, replaced_text) {
    // Clone current state for history before updating
    // const history_copy = structuredClone($state.snapshot(this.current));

    const value = this.get(path);
    const [start, end] = selection;

    const new_value = value.slice(0, start) + replaced_text + value.slice(end);

    this.set(path, new_value); // this will update the current state and create a history entry

    // this.history = [...this.history, history_copy];
    // this.future = [];
  }
  

  // updateEntry(updater) {
  //   // Clone current state for history before updating
  //   const historyCopy = structuredClone($state.snapshot(this.current));
    
  //   // Update the current state in place
  //   updater(this.current);
    
  //   this.history = [...this.history, historyCopy];
  //   this.future = [];
  // }

  undo() {
    if (this.history.length === 0) return;
    const previous = this.history[this.history.length - 1];
    const current_copy = structuredClone($state.snapshot(this.current));
    
    // Directly update current with previous state
		this.current = previous;
    
    this.history = this.history.slice(0, -1);
    this.future = [current_copy, ...this.future];
  }

  redo() {
    if (this.future.length === 0) return;
    const [next, ...remaining_future] = this.future;
    const current_copy = structuredClone($state.snapshot(this.current));
    
    // Directly update current with next state
		this.current = next;
    
    this.history = [...this.history, current_copy];
    this.future = remaining_future;
  }
}
