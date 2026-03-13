interface StreamingState {
  buffer: string;
  insideInternal: boolean;
}

export interface StreamFilter {
  process: (agentId: string, text: string) => string[];
  flush: (agentId: string) => string;
  has: (agentId: string) => boolean;
  delete: (agentId: string) => void;
}

function longestSuffix(text: string, tag: string): string {
  for (let i = Math.min(text.length, tag.length); i >= 1; i--) {
    if (text.endsWith(tag.slice(0, i))) return tag.slice(0, i);
  }
  return '';
}

export function createStreamFilter(): StreamFilter {
  const states = new Map<string, StreamingState>();

  function process(agentId: string, text: string): string[] {
    let state = states.get(agentId);
    if (!state) {
      state = { buffer: '', insideInternal: false };
      states.set(agentId, state);
    }
    state.buffer += text;
    const output: string[] = [];

    while (state.buffer.length > 0) {
      if (state.insideInternal) {
        const closeIdx = state.buffer.indexOf('</internal>');
        if (closeIdx !== -1) {
          state.buffer = state.buffer.slice(closeIdx + '</internal>'.length);
          state.insideInternal = false;
        } else {
          state.buffer = longestSuffix(state.buffer, '</internal>');
          break;
        }
      } else {
        const openIdx = state.buffer.indexOf('<internal>');
        if (openIdx !== -1) {
          if (openIdx > 0) output.push(state.buffer.slice(0, openIdx));
          state.buffer = state.buffer.slice(openIdx + '<internal>'.length);
          state.insideInternal = true;
        } else {
          const partial = longestSuffix(state.buffer, '<internal>');
          const safeLen = state.buffer.length - partial.length;
          if (safeLen > 0) output.push(state.buffer.slice(0, safeLen));
          state.buffer = partial;
          break;
        }
      }
    }
    return output;
  }

  function flush(agentId: string): string {
    const state = states.get(agentId);
    if (!state) return '';
    const remaining = state.insideInternal ? '' : state.buffer;
    states.delete(agentId);
    return remaining;
  }

  return {
    process,
    flush,
    has: (agentId) => states.has(agentId),
    delete: (agentId) => states.delete(agentId),
  };
}
