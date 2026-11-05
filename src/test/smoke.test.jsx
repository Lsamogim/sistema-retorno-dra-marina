import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

test('ambiente de teste da interface funciona', () => {
  render(<button type="button">ok</button>);
  expect(screen.getByRole('button', { name: 'ok' })).toBeInTheDocument();
});
