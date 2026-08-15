'use client';

import type { BoardSnapshot, WidgetCommandRequest, WidgetInstance } from '@fog-of-lore/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../lib/api';

export function useWidgetCommand(boardId: string, widgetId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (command: WidgetCommandRequest) =>
      apiRequest<WidgetInstance>(`/widgets/${widgetId}/commands`, {
        method: 'POST',
        body: JSON.stringify(command),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<BoardSnapshot>(['board', boardId], (current) =>
        current
          ? {
              ...current,
              widgets: current.widgets.map((item) => (item.id === updated.id ? updated : item)),
            }
          : current,
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });
}
