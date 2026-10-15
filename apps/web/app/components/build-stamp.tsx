import { formatBuildLabel, publicBuildInfo } from '../lib/build-info';

export function BuildStamp({ className }: { className?: string }) {
  const title = publicBuildInfo.builtAt ? `Сборка ${publicBuildInfo.builtAt}` : 'Локальная сборка';

  return (
    <span className={className} title={title}>
      {formatBuildLabel(publicBuildInfo)}
    </span>
  );
}
