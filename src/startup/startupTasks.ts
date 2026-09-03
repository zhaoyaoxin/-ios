import { getOrCreateInstallMacAddress } from '../services/deviceIdentity';

export type StartupTaskContext = {
  signal: AbortSignal;
};

export type StartupTask = {
  id: string;
  label: string;
  run: (context: StartupTaskContext) => Promise<void>;
};

type RunStartupTasksOptions = {
  signal: AbortSignal;
  onStatus?: (label: string) => void;
  tasks?: readonly StartupTask[];
  minimumVisibleMs?: number;
};

const abortError = () => {
  const error = new Error('启动操作已取消');
  error.name = 'AbortError';
  return error;
};

const wait = (duration: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, duration);

    const cancel = () => {
      clearTimeout(timeout);
      reject(abortError());
    };

    signal.addEventListener('abort', cancel, { once: true });
  });

/**
 * Add real startup work here: session restore, remote config, database setup,
 * permissions, migrations, etc. Tasks run in order and stop on first failure.
 */
export const appStartupTasks: readonly StartupTask[] = [
  {
    id: 'prepare-app',
    label: '正在准备应用…',
    run: async ({ signal }) => {
      if (signal.aborted) {
        throw abortError();
      }
      // 首次安装在进入首页前创建本地设备标识，后续接口会自动读取并填入 mac。
      getOrCreateInstallMacAddress();
      await Promise.resolve();
    },
  },
];

export async function runStartupTasks({
  signal,
  onStatus,
  tasks = appStartupTasks,
  minimumVisibleMs = 3000,
}: RunStartupTasksOptions) {
  const executeTasks = async () => {
    for (const task of tasks) {
      if (signal.aborted) {
        throw abortError();
      }
      onStatus?.(task.label);
      await task.run({ signal });
    }
    onStatus?.('启动完成');
  };

  await Promise.all([executeTasks(), wait(minimumVisibleMs, signal)]);
}
