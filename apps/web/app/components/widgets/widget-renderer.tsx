'use client';

import type { WidgetInstance, WidgetType } from '@fog-of-lore/contracts';
import type { ComponentType } from 'react';

import { CombatWidget } from './combat-widget';
import { DiceWidget } from './dice-widget';
import { NotesWidget } from './notes-widget';
import { TimerWidget } from './timer-widget';

export interface WidgetRendererProps {
  boardId: string;
  editMode: boolean;
  readOnly: boolean;
  widget: WidgetInstance;
}

const renderers: Record<WidgetType, ComponentType<WidgetRendererProps>> = {
  NOTES: NotesWidget,
  TIMER: TimerWidget,
  DICE: DiceWidget,
  COMBAT: CombatWidget,
};

export function WidgetRenderer(props: WidgetRendererProps) {
  const Renderer = renderers[props.widget.type];
  return (
    <div className={props.readOnly ? 'player-readonly' : undefined}>
      <Renderer {...props} />
    </div>
  );
}
