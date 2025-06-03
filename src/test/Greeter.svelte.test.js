import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Greeter from '../lib/Greeter.svelte';

describe('Greeter.svelte', () => {
  it('shows name', () => {
    const { container }  = render(Greeter, { props: { name: 'World' } });
    expect(container).toHaveTextContent('Hello World');
  });
});
