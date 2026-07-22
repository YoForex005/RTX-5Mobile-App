const targets = await fetch('http://127.0.0.1:8081/json/list').then((response) => response.json());

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const eventWaiters = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) {
      const waiters = eventWaiters.get(message.method);
      if (waiters?.length) {
        const waiter = waiters.shift();
        waiter(message.params);
      }
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  });

  return {
    close: () => socket.close(),
    waitForEvent(method) {
      return new Promise((resolve) => {
        const waiters = eventWaiters.get(method) ?? [];
        waiters.push(resolve);
        eventWaiters.set(method, waiters);
      });
    },
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

for (const target of targets) {
  const client = await connect(target.webSocketDebuggerUrl);
  try {
    await client.send('Runtime.enable');
    const controllerResult = await client.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        broker: globalThis.__rtx5BrokerDetailLaunchController?.getSnapshot?.(),
        register: globalThis.__rtx5RegisterLaunchController?.getSnapshot?.(),
        ticket: globalThis.__rtx5OrderTicketLaunchController?.getSnapshot?.(),
        quoteInfo: globalThis.__rtx5QuoteInfoLaunchController?.getSnapshot?.()
      })`,
      returnByValue: true,
    });
    const controllers = controllerResult.result?.value ?? null;
    console.log(JSON.stringify({ target: target.id, controllers }));
    if (!controllers || controllers === '{}') continue;

    const fiberResult = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (!hook?.renderers || !hook?.getFiberRoots) return null;
        const label = (fiber) => {
          const type = fiber?.elementType ?? fiber?.type;
          return type?.displayName || type?.name || (typeof type === 'string' ? type : null) || ('tag:' + fiber?.tag);
        };
        const subtreeSize = (fiber) => {
          if (!fiber) return 0;
          let total = 1;
          let child = fiber.child;
          while (child) {
            total += subtreeSize(child);
            child = child.sibling;
          }
          return total;
        };
        const output = [];
        for (const rendererId of hook.renderers.keys()) {
          for (const root of hook.getFiberRoots(rendererId)) {
            const rows = [];
            const visit = (fiber, depth) => {
              if (!fiber) return;
              const name = label(fiber);
              const interesting = /(?:Screen|Host|Navigator|Quote|Chart|Trade|History|Settings|Account|Journal|Calendar|Guide|Help|About|Interface|Destination|Tab|Drawer|Layout)/i;
              if (depth <= 180 && name && interesting.test(name)) {
                rows.push({ name, depth, size: subtreeSize(fiber) });
              }
              let child = fiber.child;
              while (child) {
                visit(child, depth + 1);
                child = child.sibling;
              }
            };
            visit(root.current, 0);
            rows.sort((left, right) => right.size - left.size);
            output.push({
              rendererId,
              total: subtreeSize(root.current),
              hosts: rows.filter((row) => /Host/i.test(row.name)).slice(0, 100),
              largest: rows.slice(0, 150),
            });
          }
        }
        return JSON.stringify(output);
      })()`,
      returnByValue: true,
    });
    console.log(JSON.stringify({ target: target.id, fibers: fiberResult.result?.value ?? null }));
    if (process.argv.includes('--fibers-only')) continue;

    await client.send('Debugger.enable');
    const samples = [];
    for (let index = 0; index < 12; index += 1) {
      const pausedEvent = client.waitForEvent('Debugger.paused');
      const pauseCommand = client.send('Debugger.pause');
      const paused = await pausedEvent;
      samples.push((paused.callFrames ?? []).slice(0, 24).map((frame) => ({
        functionName: frame.functionName,
        url: frame.url,
        line: Number(frame.location?.lineNumber ?? -1) + 1,
      })));
      await client.send('Debugger.resume');
      await pauseCommand;
      await delay(250);
    }
    console.log(JSON.stringify({ target: target.id, samples }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ target: target.id, error: String(error) }));
  } finally {
    client.close();
  }
}
