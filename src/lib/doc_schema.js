export default {
  page: {
    doc_id: { type: 'integer' },
    body: {
      type: 'multiref',
      ref_types: ['nav', 'paragraph', 'list', 'footer'],
      default_ref_type: 'paragraph',
    },
  },
  paragraph: {
    content: { type: 'annotated-text' },
  },
  list_item: {
    content: { type: 'annotated-text' },
  },
  list: {
    list_items: {
      type: 'multiref',
      ref_types: ['list_item'],
      default_ref_type: 'list_item',
    },
  },
  nav: {
    nav_items: {
      type: 'container',
      ref_types: ['doc_nav_item'],
      default_ref_type: 'doc_nav_item',
    },
  },
  nav_item: {
    // we could make this type: 'ref' but then we'd fetch all nodes of each doc referenced in the nav
    // so we keep this a dumb integer at first, but maybe we can introduce some weakref or previewref mechanism that only fetches a preview from the doc graph (not sure previews should be owned by the doc graph though)
    label: { type: 'string' },
  }
};
