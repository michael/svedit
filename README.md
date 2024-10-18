# svedit

Svedit (think Svelte Edit) is a template for building rich content editors with Svelte 5. You can model your content in JSON, render it with custom Svelte components, and edit it directly in the layout.

Try the demo at [svedit.vercel.app](https://svedit.vercel.app).

## Quick intro

Pass a piece of JSON to the `EntrySession` contructor. There are only a few rules for the format, such as a specific notation for annotated text (see the value of `subtitle`) and containers of blocks, where you need an array of objects, each featuring a `type` property (see `body`). Otherwise the shape is completely up to you. You can nest containers into blocks to create hiearchy (see `<ListBlock>`).

```js
  let entry_session = new EntrySession({
    type: 'page',
    title: ['Svedit', []],
    subtitle: ['A template for building rich content editors with Svelte 5', [
      [24, 44, 'emphasis']
    ]],
    body: [
      { type: 'story', layout: 1, title: ['First title', []], description: ['First description', []] },
      { type: 'story', layout: 2, title: ['Second title', []], description: ['Second description', []] },
      {
        type: 'list',
        list_style: 'decimal-leading-zero',
        items: [
          { type: 'list_item', description: ['List item 1' , []] },
          { type: 'list_item', description: ['List item 2', []] },
        ]
      },
    ]
  });
```

Now you can start making your Svelte pages in-place editable by wrapping your design inside the `<Svedit>` component. The `<Text>` component can be used to render and edit annotated text.

```js
<div class="my-page">
  <FloatingToolBar {entry_session} />

  <Svedit {entry_session} editable={true} class='flex-column gap-y-10'>
    <div class="header">
      <Text path={['title']} class='heading1' />
      <Text path={['subtitle']} class='heading3' />
    </div>
    <Container class="body flex-column gap-y-10" path={['body']}>
      {#snippet block(block, path)}
        {#if block.type === 'story'}
          <StoryBlock {block} {path} />
        {:else if block.type === 'list'}
          <ListBlock {block} {path} />
        {:else}
          <UnknownBlock {block} {path} />
        {/if}
      {/snippet}
    </Container>
  </Svedit>
</div>
```

Is there more documentation? No. Just read the code (it's only a couple of files with less than 1500LOC in total), copy and paste it to your app. Change it. This is not a library that tries to cover every possible use-case. This is just a starting point for you to adjust to your needs. Enjoy!

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://kit.svelte.dev/docs/adapters) for your target environment.

## Contributing

At the very moment, the best way to help is to donate or sponsor us, so we can buy time to work on this exclusively for a couple of more months, in order to make this stable. Please get in touch personally. Find my contact details [here](https://editable.website).