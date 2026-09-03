import { runStartupTasks, type StartupTask } from '../src/startup/startupTasks';

test('runs startup tasks in order and reports progress', async () => {
  const events: string[] = [];
  const tasks: StartupTask[] = [
    {
      id: 'first',
      label: '第一步',
      run: async () => {
        events.push('first');
      },
    },
    {
      id: 'second',
      label: '第二步',
      run: async () => {
        events.push('second');
      },
    },
  ];

  await runStartupTasks({
    signal: new AbortController().signal,
    minimumVisibleMs: 0,
    tasks,
    onStatus: label => events.push(label),
  });

  expect(events).toEqual(['第一步', 'first', '第二步', 'second', '启动完成']);
});

test('stops the startup flow when a task fails', async () => {
  const tasks: StartupTask[] = [
    {
      id: 'failure',
      label: '失败步骤',
      run: async () => {
        throw new Error('配置加载失败');
      },
    },
  ];

  await expect(
    runStartupTasks({
      signal: new AbortController().signal,
      minimumVisibleMs: 0,
      tasks,
    }),
  ).rejects.toThrow('配置加载失败');
});

test('prepares the default installation identity', async () => {
  await expect(
    runStartupTasks({
      signal: new AbortController().signal,
      minimumVisibleMs: 0,
    }),
  ).resolves.toBeUndefined();
});
