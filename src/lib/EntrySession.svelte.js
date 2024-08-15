export default class EntrySession {
  selection = $state();
  entry = $state();
  history = $state();
  future = $state();

  // Two types of selections are possible:
  // ContainerSelection:
  // {
  //   type: 'container',
  //   anchor_index: 2,
  //   focus_index: 5,
  // }
  
  // Field selection (text selection inside a block)
  // {
  //   type: 'text',
  //   path: ['body', 3, 'title'],
  //   anchor_index: 3, // maybe later (currently not reliable)
  //   focus_index: 5, // maybe later (currently not reliable)
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

  insert_text(path, selection, replaced_text) {
    const value = this.get(path);
    const [start, end] = selection;
    const new_value = value.slice(0, start) + replaced_text + value.slice(end);
    this.set(path, new_value); // this will update the current state and create a history entry
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