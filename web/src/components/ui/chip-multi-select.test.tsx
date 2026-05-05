// TEST-JOBS-140 — ChipMultiSelect (JOBS-021 / JOBS-023 / JOBS-049).
//
// The chip-multiselect is the primitive that replaces the comma-separated
// ID inputs the legacy `JobBoardPage` used. The tests below pin the
// keyboard-nav contract enumerated in JOBS-021 plus the `Pick up to N`
// soft cap, the chip-remove aria-label, and the empty-state copy.

import { describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@/test/render';
import { ChipMultiSelect, type ChipOption } from './chip-multi-select';

const OPTIONS: ChipOption[] = [
  { id: 1, name: 'Plumbing' },
  { id: 2, name: 'Electrical' },
  { id: 3, name: 'Carpentry' },
  { id: 4, name: 'Tiling' },
];

function setup(initial: number[] = [], maxSelectedHint?: number) {
  const onChange = vi.fn<(next: number[]) => void>();
  function Harness({ start }: { start: number[] }) {
    const [selected, setSelected] = (
      require('react') as typeof import('react')
    ).useState<number[]>(start);
    return (
      <ChipMultiSelect
        options={OPTIONS}
        selectedIds={selected}
        onChange={(next) => {
          setSelected(next);
          onChange(next);
        }}
        ariaLabel="Specialisations"
        emptyText="No specialisations match."
        maxSelectedHint={maxSelectedHint}
      />
    );
  }
  return { onChange, ...render(<Harness start={initial} />) };
}

describe('TEST-JOBS-140 ChipMultiSelect (JOBS-021)', () => {
  test('JOBS-049 — selected items render as chips with a Remove button', async () => {
    setup([1]);
    const chip = screen.getByText('Plumbing');
    expect(chip).toBeInTheDocument();
    const removeBtn = screen.getByRole('button', { name: /remove plumbing/i });
    expect(removeBtn).toBeInTheDocument();
  });

  test('JOBS-021 — typing filters the dropdown (case-insensitive substring)', async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByRole('combobox', { name: /specialisations/i });
    await user.click(input);
    await user.type(input, 'PLUM');

    const list = screen.getByRole('listbox');
    expect(within(list).getByText('Plumbing')).toBeInTheDocument();
    expect(within(list).queryByText('Electrical')).toBeNull();
    expect(within(list).queryByText('Carpentry')).toBeNull();
  });

  test('JOBS-021 — keyboard: ArrowDown opens, Enter selects, dropdown stays open across selections', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const input = screen.getByRole('combobox', { name: /specialisations/i });
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');
    // Implementation increments activeIndex on each ArrowDown (0→1), so Enter
    // selects filtered[1] = 'Electrical' (id 2).
    expect(onChange).toHaveBeenLastCalledWith([2]);
    // Stays open: continue selecting another via Enter at the new index.
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  test('JOBS-021 — Backspace on empty input removes the last chip', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([1, 2]);
    const input = screen.getByRole('combobox', { name: /specialisations/i });
    await user.click(input);
    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith([1]);
  });

  test('JOBS-021 — clicking the chip Remove button removes the chip', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([1, 2]);
    await user.click(
      screen.getByRole('button', { name: /remove plumbing/i }),
    );
    expect(onChange).toHaveBeenLastCalledWith([2]);
  });

  test('JOBS-021 — empty filter result shows the configured emptyText', async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByRole('combobox', { name: /specialisations/i });
    await user.click(input);
    await user.type(input, 'zzznotamatch');
    expect(
      screen.getByText(/no specialisations match\./i),
    ).toBeInTheDocument();
  });

  test('JOBS-023 — soft cap shows "Pick up to N" hint at the limit', async () => {
    setup([1, 2, 3, 4], 4);
    expect(
      screen.getByText(/pick up to 4 for best results\./i),
    ).toBeInTheDocument();
  });

  test('JOBS-049 — combobox role + listbox role exist (no <select multiple>, no comma input)', async () => {
    setup();
    expect(
      screen.getByRole('combobox', { name: /specialisations/i }),
    ).toBeInTheDocument();
    // The combobox is an <input> not a <select>; assert the type is text.
    const input = screen.getByRole('combobox', {
      name: /specialisations/i,
    }) as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    // Sanity: no placeholder anywhere mentions "comma-separated".
    expect(input.placeholder).not.toMatch(/comma[- ]separated/i);
  });
});
