const { parseDecision } = require('../fleet/brain');

describe('fleet brain parseDecision', () => {
    test('clean JSON parses', () => {
        const d = parseDecision('{"diagnosis":"daemon died","action":"start_daemon","message":"restarting"}');
        expect(d.action).toBe('start_daemon');
        expect(d.diagnosis).toBe('daemon died');
    });

    test('```json fenced block (reasoning-model habit) parses', () => {
        const d = parseDecision('```json\n{"diagnosis":"x","action":"none","message":"ok"}\n```');
        expect(d.action).toBe('none');
    });

    test('prose-wrapped JSON is extracted', () => {
        const d = parseDecision('Sure, here is my decision: {"diagnosis":"gap","action":"start_daemon","message":"m"} — hope that helps.');
        expect(d.action).toBe('start_daemon');
    });

    test('out-of-enum action degrades to propose (brain cannot invent actions)', () => {
        const d = parseDecision('{"diagnosis":"d","action":"reboot_host","message":"m"}');
        expect(d.action).toBe('propose');
    });

    test('missing message defaults to diagnosis', () => {
        const d = parseDecision('{"diagnosis":"only diag","action":"none"}');
        expect(d.message).toBe('only diag');
    });

    test('garbage returns null (brain degrades → deterministic recovery still fires)', () => {
        expect(parseDecision('I could not determine anything useful.')).toBeNull();
        expect(parseDecision('')).toBeNull();
        expect(parseDecision(null)).toBeNull();
    });

    test('truncated JSON (token budget exhausted) returns null, not a throw', () => {
        expect(parseDecision('{"diagnosis":"the daemon has been down for')).toBeNull();
    });
});
