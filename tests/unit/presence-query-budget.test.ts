import { describe, expect, it, vi } from 'vitest';
import { createPresenceRepository } from '../../src/lib/server/repositories/presence-repository';

function fixture(changes = 1) {
  const executed: string[] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        bind: (..._args: unknown[]) => statement,
        run: vi.fn(async () => { executed.push(sql); return { meta: { changes } }; }),
        first: vi.fn(async () => { executed.push(sql); return { active_count: 5000 }; }),
        all: vi.fn(async () => { executed.push(sql); return { results: [] }; }),
      };
      return statement;
    },
    batch: vi.fn(async (statements: any[]) => Promise.all(statements.map(s => s.run()))),
  };
  const args = {
    activeCutoff: 880000, writeCutoff: 955000, dailyVisitorLimit: 200,
    maxVisitorsPerNetwork: 20, networkHash: 'network', overflowHash: 'overflow',
    visitorHash: 'visitor', visitDate: '2026-10-23',
    record: { browserName: 'browser', currentPath: '/', deviceType: 'phone', displayName: null,
      firstSeenAt: 1000000, lastSeenAt: 1000000, isOverflow: false, operatingSystem: 'Android',
      principalId: null, role: null, practiceVisible: false, practiceActivity: null, practiceStartedAt: null },
  };
  return { db, args, executed, repository: createPresenceRepository({ DB: db } as never) };
}

describe('presence D1 query budget', () => {
  it('uses two statements for an existing visitor while retaining daily analytics', async () => {
    const f = fixture();
    await f.repository.writeHeartbeat(f.args);
    expect(f.executed).toHaveLength(2);
    expect(f.executed[1]).toContain('INSERT INTO visitor_daily_presence');
  });
  it('keeps all cap/overflow statements for a new or throttled visitor', async () => {
    const f = fixture(0);
    await f.repository.writeHeartbeat(f.args);
    expect(f.executed).toHaveLength(5);
    const daily = f.executed.filter(sql => sql.includes('INSERT INTO visitor_daily_presence'));
    expect(daily).toHaveLength(2);
    expect(daily[0]).toContain('changes() > 0');
    expect(daily[1]).toContain('1 = 1');
  });
  it('serves 5000 public count reads in the same window with one SQL, then expires', async () => {
    const f = fixture();
    for (let i = 0; i < 5000; i++) expect(await f.repository.countActive(880000 + i)).toBe(5000);
    expect(f.executed).toHaveLength(1);
    await f.repository.countActive(890000);
    expect(f.executed).toHaveLength(2);
  });
  it('invalidates the numeric count after a new arrival and isolates databases', async () => {
    const f = fixture(0), other = fixture();
    await f.repository.countActive(880000);
    await f.repository.writeHeartbeat(f.args);
    await f.repository.countActive(880000);
    expect(f.executed.filter(sql => sql.includes('COUNT(*) AS active_count'))).toHaveLength(2);
    await other.repository.countActive(880000);
    expect(other.executed).toHaveLength(1);
  });
  it('always refreshes the practitioner list so opt-out is immediately respected', async () => {
    const f = fixture();
    await f.repository.listActivePractice(880000);
    await f.repository.listActivePractice(880000);
    expect(f.executed).toHaveLength(2);
  });
  it('coalesces concurrent numeric reads across repositories sharing the same database', async () => {
    const f = fixture();
    const other = createPresenceRepository({ DB: f.db } as never);
    const results = await Promise.all(Array.from({ length: 100 }, (_, index) =>
      (index % 2 ? other : f.repository).countActive(880000 + index)));
    expect(results).toEqual(Array(100).fill(5000));
    expect(f.executed).toHaveLength(1);
  });
  it('expires by wall clock even when the caller repeats the same cutoff', async () => {
    const f = fixture();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000000);
    try {
      await f.repository.countActive(880000);
      clock.mockReturnValue(1009999);
      await f.repository.countActive(880000);
      expect(f.executed).toHaveLength(1);
      clock.mockReturnValue(1010000);
      await f.repository.countActive(880000);
      expect(f.executed).toHaveLength(2);
    } finally { clock.mockRestore(); }
  });
  it('does not publish a count read that was overtaken by a heartbeat write', async () => {
    const f = fixture();
    let release!: (value: { active_count: number }) => void;
    const blocked = new Promise<{ active_count: number }>(resolve => { release = resolve; });
    const prepare = f.db.prepare.bind(f.db);
    let reads = 0;
    vi.spyOn(f.db, 'prepare').mockImplementation(sql => {
      const statement = prepare(sql);
      if (sql.includes('COUNT(*) AS active_count')) statement.first.mockImplementation(async () => {
        f.executed.push(sql);
        reads += 1;
        return reads === 1 ? blocked : { active_count: 6000 };
      });
      return statement;
    });
    const pending = f.repository.countActive(880000);
    await f.repository.writeHeartbeat(f.args);
    release({ active_count: 5000 });
    expect(await pending).toBe(5000);
    expect(await f.repository.countActive(880000)).toBe(6000);
    expect(reads).toBe(2);
  });
  it('invalidates cached numbers after purging expired visitors', async () => {
    const f = fixture();
    await f.repository.countActive(880000);
    await f.repository.purgeExpired(880000, 0);
    await f.repository.countActive(880000);
    expect(f.executed.filter(sql => sql.includes('COUNT(*) AS active_count'))).toHaveLength(2);
  });
  it('retries a failed numeric read instead of caching its rejection', async () => {
    const f = fixture();
    const prepare = f.db.prepare.bind(f.db);
    let fail = true;
    vi.spyOn(f.db, 'prepare').mockImplementation(sql => {
      const statement = prepare(sql);
      if (fail && sql.includes('COUNT(*) AS active_count')) {
        fail = false;
        statement.first.mockRejectedValueOnce(new Error('database unavailable'));
      }
      return statement;
    });
    await expect(f.repository.countActive(880000)).rejects.toThrow('database unavailable');
    await expect(f.repository.countActive(880000)).resolves.toBe(5000);
  });
  it('bounds each numeric read to one SQL while writes continuously invalidate it', async () => {
    const f = fixture();
    const prepare = f.db.prepare.bind(f.db);
    let reads = 0;
    let invalidate = true;
    vi.spyOn(f.db, 'prepare').mockImplementation(sql => {
      const statement = prepare(sql);
      if (sql.includes('COUNT(*) AS active_count')) statement.first.mockImplementation(async () => {
        reads += 1;
        if (reads > 5) throw new Error('unbounded count retry');
        if (invalidate) await f.repository.writeHeartbeat(f.args);
        return { active_count: invalidate ? 5000 : 6000 };
      });
      return statement;
    });
    for (let index = 0; index < 3; index += 1) {
      expect(await f.repository.countActive(880000)).toBe(5000);
      expect(reads).toBe(index + 1);
    }
    invalidate = false;
    expect(await f.repository.countActive(880000)).toBe(6000);
    expect(await f.repository.countActive(880000)).toBe(6000);
    expect(reads).toBe(4);
  });
});
