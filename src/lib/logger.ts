import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';

function getTargets(filename: string): pino.TransportTargetOptions[] {
  return [
    {
      target: 'pino-roll',
      options: {
        file: `logs/${filename}`,
        frequency: 'daily',
        size: '10m',
        mkdir: true,
      },
      level,
    },
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
      level: process.env.LOG_LEVEL || 'debug',
    },
  ];
}

const sysLogger = pino({ level: 'debug' }, pino.transport({ targets: getTargets('system') }));
const convLogger = pino({ level: 'debug' }, pino.transport({ targets: getTargets('conversation') }));
const wsLogger = pino({ level: 'debug' }, pino.transport({ targets: getTargets('workspace') }));

/**
 * Create a child logger with a module name.
 * Automatically routes to the correct file log based on module.
 */
export const createLogger = (module: string) => {
  let parent = sysLogger;
  
  if (['NewConv', 'SendMsg', 'Proceed', 'Revert', 'Steps'].includes(module)) {
    parent = convLogger;
  } else if (['Launch', 'Close', 'Kill', 'FileSearch', 'Workspace'].includes(module)) {
    parent = wsLogger;
  }
  
  return parent.child({ module });
};
