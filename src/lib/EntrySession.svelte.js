export default class EntrySession {
  selection = $state();
  entry = $state();
  history = $state();
  future = $state();

  // Two types of selections are possible:
  // ContainerSelection:
  // {
  //   type: 'container',
  //   anchor_offset: 2,
  //   focus_offset: 5,
  // }
  
  // Text selection (text selection inside a block or root field)
  // {
  //   type: 'text',
  //   path: ['body', 3, 'title'],
  //   anchor_offset: 3, // maybe later (currently not reliable)
  //   focus_offset: 5, // maybe later (currently not reliable)
  // }

  constructor(entry) {
    this.selection = null;
    this.entry = entry;
    this.history = [];
    this.future = [];
  }

  get(path) {
    let current = this.entry;
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
    const history_copy = {
      entry: structuredClone($state.snapshot(this.entry)),
      selection: structuredClone($state.snapshot(this.selection)),
    };

    if (path.length === 0) {
      return value;
    }
  
    let current = this.entry;
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

  insert_text(replaced_text) {
    if (this.selection.type !== 'text') return;
    
    const value = this.get(this.selection.path);
    const [start, end] = [
      Math.min(this.selection.anchor_offset, this.selection.focus_offset),
      Math.max(this.selection.anchor_offset, this.selection.focus_offset)
    ];
    const new_value = value.slice(0, start) + replaced_text + value.slice(end);
    this.set(this.selection.path, new_value); // this will update the current state and create a history entry

    // Setting the selection automatically triggers a re-render of the corresponding DOMSelection.
    this.selection = {
      type: 'text',
      path: this.selection.path,
      anchor_offset: start + 1,
      focus_offset: start + 1,
    };
  }

  undo() {
    if (this.history.length === 0) return;
    const previous = this.history[this.history.length - 1];
    const current_copy = {
      entry: structuredClone($state.snapshot(this.entry)),
      selection: structuredClone($state.snapshot(this.selection)),
    };
    
    // Directly update entry and selection with previous state
    this.entry = previous.entry;
    this.selection = previous.selection;
    this.history = this.history.slice(0, -1);
    this.future = [current_copy, ...this.future];
  }

  redo() {
    if (this.future.length === 0) return;
    const [next, ...remaining_future] = this.future;
    const current_copy = {
      entry: structuredClone($state.snapshot(this.entry)),
      selection: structuredClone($state.snapshot(this.selection)),
    };
    
    // Directly update entry and selection with next state
    this.entry = next.entry;
    this.selection = next.selection;
    
    this.history = [...this.history, current_copy];
    this.future = remaining_future;
  }
}