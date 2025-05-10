
export default class SveditDocument {
  document_id = $state();
  nodes = $state();

  constructor(schema, raw_document) {
    this.schema = schema;
    this.nodes = {};

    for (const node of raw_document) {
      this.create(node);
    }

    // The last element in the raw_document is the document itself (the root node)
    this.document_id = raw_document.at(-1).id;
  }

  // doc.get('list_1')
  // doc.get('list_1')
  // doc.get(['list_1', 'list_items'])
  get (path) {
    if (!path) return undefined
    if (typeof path === 'string') {
      return this.nodes[path];
    } else if (path.length === 1) {
      return this.nodes[path[0]];
    } else if (path.length > 1) {
      const node = this.nodes[path[0]];
      let val = node[path[1]];
      // This is used when the property value is an object,
      // so you can traverse the object (e.g. an array)
      for (let i = 2; i < path.length; i++) {
        if (!val) return undefined
        val = val[path[i]];
      }
      return val;
    }
  }

  // Set a property of a node to a new value
  // doc.set('list_1', 'list_items',  [1, 2, 3] })
  set (path, value) {
    const node = this.get(path[0]);
    // TODO: We need to remember the old value and make an entry to the undo stack
    node[path[1]] = value;
  }

  create(node) {
    // TODO: check if node is valid according to schema
    // If other nodes are referenced, those have to be in the graph already
    // NOTE: This is why the order of nodes in the raw_document matters
    this.nodes[node.id] = node;
  }

}
