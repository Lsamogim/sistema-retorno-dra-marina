import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { Avatar, Dialog, Menu, Sheet, StageTabs, TextField, ToastProvider, useToast } from './index.js';

const STAGES = [
  { id: 'chamar', label: 'Chamar', shortLabel: 'Chamar', count: 3 },
  { id: 'aguardando', label: 'Aguardando resposta', shortLabel: 'Aguardando', count: 1 },
];

describe('StageTabs', () => {
  test('StageTabs marca aria-selected e chama onChange', async () => {
    const onChange = vi.fn();
    render(<StageTabs stages={STAGES} value="chamar" onChange={onChange} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Chamar/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Aguardando resposta/ })).toHaveAttribute('aria-selected', 'false');
    await userEvent.click(screen.getByRole('tab', { name: /Aguardando resposta/ }));
    expect(onChange).toHaveBeenCalledWith('aguardando');
  });
});

describe('Sheet', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir ficha
        </button>
        <Sheet open={open} title="Karina Cardoso" onClose={() => setOpen(false)}>
          <p>conteúdo</p>
        </Sheet>
      </>
    );
  }

  test('Sheet foca o título ao abrir, fecha com Esc e devolve o foco', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Abrir ficha' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Karina Cardoso' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Karina Cardoso' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('Toast', () => {
  function Trigger({ onUndo }) {
    const { show } = useToast();
    return (
      <button type="button" onClick={() => show({ message: 'Movido para Aguardando resposta', actions: [{ label: 'Desfazer', onClick: onUndo }] })}>
        disparar
      </button>
    );
  }

  test('Toast executa a ação e some após duration', () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'disparar' }));
    expect(screen.getByRole('status')).toHaveTextContent('Movido para Aguardando resposta');
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'disparar' }));
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.queryByText('Movido para Aguardando resposta')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('TextField', () => {
  test('TextField com error expõe role=alert ligado ao campo', () => {
    render(<TextField label="Telefone" value="" onChange={() => {}} error="Telefone inválido" />);
    const input = screen.getByLabelText('Telefone');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Telefone inválido');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Menu', () => {
  test('Menu abre, navega por seta e fecha com Esc', async () => {
    const onA = vi.fn();
    render(
      <Menu
        label="Mais ações para Karina"
        items={[
          { label: 'Agendou', onSelect: onA },
          { label: 'Não vai voltar', onSelect: () => {}, destructive: true },
        ]}
      />
    );
    const trigger = screen.getByRole('button', { name: 'Mais ações para Karina' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await userEvent.click(trigger);
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Agendou' }));
    expect(onA).toHaveBeenCalled();
  });
});

describe('Avatar', () => {
  test('Avatar mostra as iniciais de "Karina Cardoso" como "KC"', () => {
    render(<Avatar name="Karina Cardoso" />);
    expect(screen.getByText('KC')).toBeInTheDocument();
  });
});

describe('Dialog', () => {
  test('Dialog confirma e cancela', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <Dialog open title="Tirar Karina de todos os procedimentos?" description="Capilar e Botox" confirmLabel="Tirar da lista" destructive onConfirm={onConfirm} onCancel={onCancel} />
    );
    expect(screen.getByRole('alertdialog', { name: 'Tirar Karina de todos os procedimentos?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tirar da lista' }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
