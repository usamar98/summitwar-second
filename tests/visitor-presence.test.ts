import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,it,expect} from 'vitest';
let db:PGlite;
const a='a'.repeat(64),b='b'.repeat(64);
async function visit(hash:string){return (await db.query<{counts:{current:number;total:number}}>('select register_site_visit($1) counts',[hash])).rows[0].counts}
beforeAll(async()=>{db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;');await db.exec(readFileSync('supabase/visitor-presence.sql','utf8'));},30000);
afterAll(async()=>db.close());
it('counts browsers, deduplicates repeated tabs and concurrent heartbeats',async()=>{expect(await visit(a)).toEqual({current:1,total:1});await Promise.all([visit(a),visit(a)]);expect(await visit(b)).toEqual({current:2,total:2});});
it('expires presence independently of all-time visits and starts a new visit after inactivity',async()=>{await db.query("update site_visitors set last_seen=now()-interval '2 minutes' where visitor_hash=$1",[a]);expect(await visit(b)).toEqual({current:1,total:2});expect(await visit(a)).toEqual({current:2,total:2});await db.query("update site_visitors set last_seen=now()-interval '31 minutes' where visitor_hash=$1",[a]);expect(await visit(a)).toEqual({current:2,total:3});});
it('preserves totals when stale browser identifiers are removed',async()=>{await db.query("update site_visitors set last_seen=now()-interval '91 days' where visitor_hash=$1",[a]);expect(await visit(b)).toEqual({current:1,total:3});expect((await db.query<{n:number}>('select count(*) n from site_visitors')).rows[0].n).toBe(1);});
it('rejects invalid identifiers and anonymous access to counts and identifiers',async()=>{await expect(visit('fake')).rejects.toThrow('Invalid visitor');await db.exec('set role anon');try{await expect(visit(a)).rejects.toThrow();await expect(db.query('select * from site_visitors')).rejects.toThrow();await expect(db.query('select * from site_visit_totals')).rejects.toThrow();}finally{await db.exec('reset role')}});
