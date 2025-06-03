import { describe, it, expect } from 'vitest';
import { render, } from 'svelte/server';
import Greeter from '$lib/Greeter.svelte';

describe('Greeter.svelte SSR', () => {
  it('renders name', () => {
    const { body } = render(Greeter, { props: { name: 'foo' }});
    expect(body).toContain('foo');
  });
});