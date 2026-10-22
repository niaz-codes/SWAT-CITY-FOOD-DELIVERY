// ============================================================
// Swat City Backend - Data layer
//
// A small, Mongoose-compatible facade over Supabase PostgREST.
// Every model is described by a `ModelConfig` (table + columns +
// optional hidden/array/refs) and exposes the subset of the
// Mongoose API this backend actually uses:
//
//   find / findOne / findById / countDocuments / exists
//   create / insertMany
//   updateOne / updateMany / findOneAndUpdate / deleteOne / deleteMany
//   aggregate
//   doc.save() / doc.toObject() / doc.set() / doc.deleteOne()
//   query.sort().skip().limit().select().populate().lean().exec()
//
// The service role key is used, so Row Level Security is bypassed.
// Keep this module server-side only.
// ============================================================

import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Public types (kept compatible with the previous data-layer surface)
// ---------------------------------------------------------------------------

export type Doc<T> = T & {
  save(): Promise<Doc<T>>;
  toObject(): T;
  set(key: any, value?: any): Doc<T>;
  markModified(path?: string): Doc<T>;
  deleteOne(): Promise<void>;
  readonly isNew?: boolean;
};

export type Filter = Record<string, any>;
export type SortDirection = 1 | -1 | 'asc' | 'desc';
export type SortSpec =
  Record<string, SortDirection> | string | ReadonlyArray<[string, SortDirection]>;

export interface UpdateOptions {
  new?: boolean;
  upsert?: boolean;
  runValidators?: boolean;
}

export interface UpdateResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  upsertedId: string | null;
}

export interface DeleteResult {
  acknowledged: boolean;
  deletedCount: number;
}

export interface ModelApi<T> {
  table: string;
  config: ModelConfig<T>;
  find(filter?: Filter, projection?: string | Record<string, any>): Query<Doc<T>[]>;
  findOne(filter?: Filter, projection?: string | Record<string, any>): Query<Doc<T> | null>;
  findById(id: any, projection?: string | Record<string, any>): Query<Doc<T> | null>;
  countDocuments(filter?: Filter): Query<number>;
  estimatedDocumentCount(): Query<number>;
  exists(filter?: Filter): Query<{ _id: any } | null>;
  create(input: any): Query<Doc<T>>;
  insertMany(docs: any[]): Query<Doc<T>[]>;
  updateOne(filter: Filter, update: any, options?: UpdateOptions): Query<UpdateResult>;
  updateMany(filter: Filter, update: any, options?: UpdateOptions): Query<UpdateResult>;
  findOneAndUpdate(filter: Filter, update: any, options?: UpdateOptions): Query<Doc<T> | null>;
  findByIdAndUpdate(id: any, update: any, options?: UpdateOptions): Query<Doc<T> | null>;
  deleteOne(filter?: Filter): Query<DeleteResult>;
  deleteMany(filter?: Filter): Query<DeleteResult>;
  findByIdAndDelete(id: any): Query<DeleteResult>;
  aggregate<R = any>(pipeline: any[]): Query<R[]>;
}

export interface ModelConfig<T> {
  table: string;
  columns: readonly (keyof T & string)[];
  hidden?: readonly string[];
  arrayCols?: readonly string[];
  refs?: Record<string, () => any>;
}

export type SortDirectionNormalized = SortDirection;

export function normalizeSortSpec(spec?: SortSpec): Record<string, SortDirection> {
  const out: Record<string, SortDirection> = {};
  if (!spec) return out;
  if (typeof spec === 'string') {
    for (const part of spec.split(/[\s,]+/).filter(Boolean)) {
      if (part.startsWith('-')) out[part.slice(1)] = -1;
      else if (part.startsWith('+')) out[part.slice(1)] = 1;
      else out[part] = 1;
    }
    return out;
  }
  if (Array.isArray(spec)) {
    for (const [key, dir] of spec as ReadonlyArray<[string, SortDirection]>) out[key] = dir;
    return out;
  }
  for (const [key, dir] of Object.entries(spec as Record<string, SortDirection>)) out[key] = dir;
  return out;
}

// ---------------------------------------------------------------------------
// Low-level HTTP helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const http: (url: string, init?: any) => Promise<any> = (globalThis as any).fetch;

class DbError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'DbError';
    this.status = status;
    this.code = code;
  }
}

function baseUrl(): string {
  return `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`;
}

interface RestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Sleep helper used by the transient-failure retry below. */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How many times a request is attempted before the failure is surfaced. */
const REST_ATTEMPTS = 3;
/** First retry delay; doubles on every further attempt. */
const RETRY_BASE_MS = 300;

async function rest(path: string, init: RestInit = {}): Promise<any> {
  let res: any;
  let lastError: unknown;
  for (let attempt = 1; attempt <= REST_ATTEMPTS; attempt++) {
    try {
      res = await http(`${baseUrl()}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          'User-Agent': 'node',
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(init.headers ?? {}),
        },
        body: init.body,
      });
      break;
    } catch (error) {
      // Only transport-level failures (DNS blip, connect/reset timeout) are
      // retried. An HTTP error is returned by `http`, never thrown, so a
      // rejected request is never replayed — that matters for writes.
      lastError = error;
      if (attempt === REST_ATTEMPTS) break;
      await delay(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  if (!res) throw lastError;

  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      body = '';
    }
    let code: string | undefined;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.code === 'string') code = parsed.code;
    } catch {
      code = undefined;
    }
    throw new DbError(
      `[db] ${init.method ?? 'GET'} ${path} -> ${res.status} ${res.statusText}${body ? `: ${body}` : ''}`,
      res.status,
      code,
    );
  }
  return res;
}

async function restJson(path: string, init: RestInit = {}): Promise<any> {
  const res = await rest(path, init);
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function countFrom(res: any): number | null {
  const cr = res?.headers?.get?.('content-range');
  if (!cr) return null;
  const m = /\/(\d+)\s*$/.exec(cr);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Value encoding (PostgREST filter syntax)
// ---------------------------------------------------------------------------

function needsQuote(s: string): boolean {
  return (
    s.length === 0 ||
    /[",{}()]/.test(s) ||
    s !== s.trim() ||
    /^(null|true|false)$/i.test(s) ||
    /^-?\d/.test(s)
  );
}

function encVal(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (v instanceof Date) return encodeURIComponent(v.toISOString());
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'string') {
    return needsQuote(v)
      ? encodeURIComponent(`"${v.replace(/"/g, '\\"')}"`)
      : encodeURIComponent(v);
  }
  return encodeURIComponent(JSON.stringify(v));
}

function arrLit(values: unknown[]): string {
  if (!values.length) return '{}';
  return `{${values.map((v) => (v == null ? 'NULL' : encVal(v))).join(',')}}`;
}

function inList(values: any[]): string {
  return `(${values.map((v) => encVal(v)).join(',')})`;
}

function dbPath(field: string): string {
  const parts = field.split('.');
  let col = parts[0].toLowerCase();
  for (let i = 1; i < parts.length; i += 1) {
    col += (i === parts.length - 1 ? '->>' : '->') + parts[i].toLowerCase();
  }
  return col;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function toArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

function isPlainObject(v: any): boolean {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

function resolveId(v: any): any {
  if (v && typeof v === 'object' && '_id' in v) return v._id;
  return v;
}

function getPath(obj: any, path: string): any {
  if (!path.includes('.')) return obj?.[path];
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

interface Fn {
  (row: any): boolean;
}

function deepEq(a: any, b: any): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function looseEq(a: any, b: any): boolean {
  if (a && typeof a === 'object' && '_id' in a) a = a._id;
  if (b && typeof b === 'object' && '_id' in b) b = b._id;
  if (a instanceof Date || b instanceof Date) {
    return new Date(a).getTime() === new Date(b).getTime();
  }
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'object' || typeof b === 'object') return deepEq(a, b);
  return String(a) === String(b);
}

function cmp(a: any, b: any): number {
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

function cmpBy(path: string): (a: any, b: any) => number {
  return (a, b) => cmp(getPath(a, path), getPath(b, path));
}

// ---------------------------------------------------------------------------
// Filter translation: PostgREST pushdown + JS fallback predicates
// ---------------------------------------------------------------------------

const TAG_SHADOW: Record<string, string> = { tags: 'tags_text' };

interface Translation {
  clauses: string[];
  js: Fn[];
}

function translateFilter(cfg: ModelConfig<any>, filter?: Filter): { query: string; js: Fn[] } {
  let clauses: string[] = [];
  let js: Fn[] = [];
  if (filter && Object.keys(filter).length) {
    const translated = translateObject(cfg, filter);
    clauses = translated.clauses;
    js = translated.js;
  }
  const query = clauses.length ? `and=(${clauses.join(',')})` : '';
  return { query, js };
}

function translateObject(
  cfg: ModelConfig<any>,
  obj: Record<string, any>,
): { clauses: string[]; js: Fn[] } {
  const clauses: string[] = [];
  const js: Fn[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (key === '$or' || key === '$and' || key === '$nor') {
      const subs = Array.isArray(value) ? value : [value];
      if (key === '$nor') {
        js.push((row) => subs.every((sub) => !matchFilter(row, sub)));
        continue;
      }
      const parts = subs.map((s) => translateObject(cfg, s as Record<string, any>));
      if (parts.some((p) => p.js.length > 0)) {
        if (key === '$or') js.push((row) => subs.some((sub) => matchFilter(row, sub)));
        else js.push((row) => subs.every((sub) => matchFilter(row, sub)));
      } else if (key === '$and') {
        for (const p of parts) clauses.push(...p.clauses);
      } else if (parts.length > 0) {
        clauses.push(
          `or(${parts
            .map((p) => (p.clauses.length === 1 ? p.clauses[0] : `and(${p.clauses.join(',')})`))
            .join(',')})`,
        );
      } else {
        js.push(() => false);
      }
      continue;
    }
    translateField(cfg, key, value, clauses, js);
  }
  return { clauses, js };
}

function translateField(
  cfg: ModelConfig<any>,
  field: string,
  value: any,
  clauses: string[],
  js: Fn[],
): void {
  const isArray = (cfg.arrayCols ?? []).includes(field);
  const col = dbPath(field);
  const hasOps = isPlainObject(value) && Object.keys(value).some((k) => k.startsWith('$'));

  if (!hasOps) {
    if (value === undefined) return;
    if (value === null) clauses.push(`${col}.is.null`);
    else if (isArray && typeof value !== 'object') clauses.push(`${col}.cs.${arrLit([value])}`);
    else if (isPlainObject(value)) js.push((row) => deepEq(getPath(row, field), value));
    else clauses.push(`${col}.eq.${encVal(value)}`);
    return;
  }

  const cond = value as Record<string, any>;
  for (const [op, operand] of Object.entries(cond)) {
    switch (op) {
      case '$options':
        break;
      case '$eq':
        if (operand === null) clauses.push(`${col}.is.null`);
        else if (isArray && typeof operand !== 'object')
          clauses.push(`${col}.cs.${arrLit([operand])}`);
        else clauses.push(`${col}.eq.${encVal(resolveId(operand))}`);
        break;
      case '$ne':
        if (operand === null) clauses.push(`${col}.not.is.null`);
        else if (isArray) {
          if (Array.isArray(operand)) js.push((row) => !deepEq(getPath(row, field), operand));
          else clauses.push(`${col}.not.cs.${arrLit([operand])}`);
        } else clauses.push(`${col}.not.eq.${encVal(operand)}`);
        break;
      case '$gt':
        clauses.push(`${col}.gt.${encVal(operand)}`);
        break;
      case '$gte':
        clauses.push(`${col}.gte.${encVal(operand)}`);
        break;
      case '$lt':
        clauses.push(`${col}.lt.${encVal(operand)}`);
        break;
      case '$lte':
        clauses.push(`${col}.lte.${encVal(operand)}`);
        break;
      case '$in': {
        const list = toArray(operand).map(resolveId);
        if (list.length === 0) js.push(() => false);
        else if (isArray) clauses.push(`${col}.ov.${arrLit(list)}`);
        else clauses.push(`${col}.in.${inList(list)}`);
        break;
      }
      case '$nin': {
        const list = toArray(operand).map(resolveId);
        if (list.length === 0) break;
        if (isArray) clauses.push(`${col}.not.ov.${arrLit(list)}`);
        else clauses.push(`${col}.not.in.${inList(list)}`);
        break;
      }
      case '$exists':
        clauses.push(operand ? `${col}.not.is.null` : `${col}.is.null`);
        break;
      case '$all':
        clauses.push(`${col}.cs.${arrLit(toArray(operand))}`);
        break;
      case '$regex': {
        const src = operand instanceof RegExp ? operand.source : String(operand);
        if (isArray) {
          const shadow = TAG_SHADOW[field];
          if (!shadow) {
            js.push((row) => regexTest(getPath(row, field), src));
            break;
          }
          clauses.push(`${shadow}.ilike.*${encodeURIComponent(src)}*`);
          break;
        }
        clauses.push(`${col}.ilike.*${encodeURIComponent(src)}*`);
        break;
      }
      case '$size':
        js.push((row) => {
          const a = getPath(row, field);
          return Array.isArray(a) && a.length === operand;
        });
        break;
      case '$elemMatch':
        js.push((row) => {
          const a = getPath(row, field);
          return Array.isArray(a) && a.some((e) => matchFilter(e, operand));
        });
        break;
      default:
        break;
    }
  }
}

function regexTest(value: any, src: string): boolean {
  const re = new RegExp(src, 'i');
  if (Array.isArray(value)) return value.some((v) => re.test(String(v)));
  return re.test(String(value ?? ''));
}

// ---------------------------------------------------------------------------
// In-memory matcher (used for the operators PostgREST cannot express)
// ---------------------------------------------------------------------------

function matchFilter(obj: any, filter: any): boolean {
  if (!filter || typeof filter !== 'object') return true;
  for (const [key, value] of Object.entries(filter)) {
    if (key === '$or') {
      if (!toArray(value).some((s) => matchFilter(obj, s))) return false;
      continue;
    }
    if (key === '$and') {
      if (!toArray(value).every((s) => matchFilter(obj, s))) return false;
      continue;
    }
    if (key === '$nor') {
      if (toArray(value).some((s) => matchFilter(obj, s))) return false;
      continue;
    }
    if (!matchValue(getPath(obj, key), value)) return false;
  }
  return true;
}

function matchValue(cur: any, cond: any): boolean {
  if (isPlainObject(cond) && Object.keys(cond).some((k) => k.startsWith('$'))) {
    for (const [op, operand] of Object.entries(cond)) {
      switch (op) {
        case '$options':
          break;
        case '$eq':
          if (!looseEq(cur, operand)) return false;
          break;
        case '$ne':
          if (looseEq(cur, operand)) return false;
          break;
        case '$gt':
          if (!(cmp(cur, operand) > 0)) return false;
          break;
        case '$gte':
          if (!(cmp(cur, operand) >= 0)) return false;
          break;
        case '$lt':
          if (!(cmp(cur, operand) < 0)) return false;
          break;
        case '$lte':
          if (!(cmp(cur, operand) <= 0)) return false;
          break;
        case '$in': {
          const list = toArray(operand).map(resolveId);
          const hit = list.some((x) =>
            Array.isArray(cur) ? cur.some((c) => looseEq(c, x)) : looseEq(cur, x),
          );
          if (!hit) return false;
          break;
        }
        case '$nin': {
          const list = toArray(operand).map(resolveId);
          const hit = list.some((x) =>
            Array.isArray(cur) ? cur.some((c) => looseEq(c, x)) : looseEq(cur, x),
          );
          if (hit) return false;
          break;
        }
        case '$exists':
          if (operand ? cur === undefined || cur === null : !(cur === undefined || cur === null)) {
            return false;
          }
          break;
        case '$regex': {
          const re =
            cond.$regex instanceof RegExp
              ? cond.$regex
              : new RegExp(String(cond.$regex), (cond.$options as string) || '');
          if (Array.isArray(cur)) {
            if (!cur.some((e) => re.test(String(e)))) return false;
          } else if (!re.test(String(cur ?? ''))) {
            return false;
          }
          break;
        }
        case '$size':
          if (!(Array.isArray(cur) && cur.length === operand)) return false;
          break;
        case '$all':
          if (
            !toArray(operand).every((x) => Array.isArray(cur) && cur.some((c) => looseEq(c, x)))
          ) {
            return false;
          }
          break;
        default:
          break;
      }
    }
    return true;
  }
  if (Array.isArray(cur)) return cur.some((c) => looseEq(c, cond));
  return looseEq(cur, cond);
}

// ---------------------------------------------------------------------------
// Row <-> document mapping / projection
// ---------------------------------------------------------------------------

function mapRowToCamel(cfg: ModelConfig<any>, row: any): any {
  const out: any = {};
  if (row && row._id !== undefined) out._id = row._id;
  for (const col of cfg.columns) {
    const db = col.toLowerCase();
    if (row && Object.prototype.hasOwnProperty.call(row, db)) {
      const v = row[db];
      out[col] = /At$/.test(col) && v != null && !(v instanceof Date) ? new Date(v) : v;
    }
  }
  return out;
}

function resolveSelection(cfg: ModelConfig<any>, spec?: string): Set<string> {
  const hidden = new Set<string>(cfg.hidden ?? []);
  const selection = new Set<string>();
  if (!spec) {
    for (const col of cfg.columns) if (!hidden.has(col)) selection.add(col);
    selection.add('_id');
    return selection;
  }
  const tokens = spec.split(/\s+/).filter(Boolean);
  const plus = tokens.filter((t) => t.startsWith('+')).map((t) => t.slice(1));
  const minus = tokens.filter((t) => t.startsWith('-')).map((t) => t.slice(1));
  const plain = tokens.filter((t) => !t.startsWith('+') && !t.startsWith('-'));
  const base = plain.length > 0 ? plain : cfg.columns.filter((c) => !hidden.has(c));
  for (const c of base) selection.add(c);
  for (const p of plus) selection.add(p);
  for (const m of minus) selection.delete(m);
  if (!minus.includes('_id')) selection.add('_id');
  void hidden;
  return selection;
}

function applyProjection(obj: any, selection: Set<string>): void {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key === 'id') continue;
    if (!selection.has(key)) delete obj[key];
  }
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

function toDoc(cfg: ModelConfig<any>, data: any, lean: boolean): any {
  if (lean) return { ...data };
  const obj: any = { ...data };
  obj.id = obj._id;
  Object.defineProperty(obj, '__snapshot', {
    value: structuredClone(data),
    enumerable: false,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(obj, '__docCfg', { value: cfg, enumerable: false });
  Object.defineProperty(obj, 'save', {
    value: () => saveDoc(cfg, obj),
    enumerable: false,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(obj, 'toObject', {
    value: () => {
      const out: any = {};
      for (const key of Object.keys(obj)) if (key !== 'id') out[key] = obj[key];
      return out;
    },
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(obj, 'set', {
    value: (key: any, value?: any) => {
      if (isPlainObject(key)) Object.assign(obj, key);
      else obj[key] = value;
      return obj;
    },
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(obj, 'markModified', {
    value: () => obj,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(obj, 'deleteOne', {
    value: async () => {
      await deleteWhere(cfg, { _id: obj._id });
    },
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(obj, 'toString', {
    value: () => String(obj._id),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(obj, 'isNew', { value: false, enumerable: false });
  return obj;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

interface PopulateSpec {
  paths: string[];
  select?: string;
}

interface QueryState {
  filter: Filter;
  select?: string;
  sort?: SortSpec;
  skip?: number;
  limit?: number;
  populates: PopulateSpec[];
  lean: boolean;
}

export class Query<T = any> {
  private readonly runner: (state: QueryState) => Promise<any>;
  private readonly state: QueryState;

  constructor(runner: (state: QueryState) => Promise<any>, filter: Filter = {}) {
    this.runner = runner;
    this.state = { filter, populates: [], lean: false };
  }

  sort(spec?: SortSpec): this {
    this.state.sort = spec;
    return this;
  }
  skip(n?: number): this {
    this.state.skip = n;
    return this;
  }
  limit(n?: number): this {
    this.state.limit = n;
    return this;
  }
  select(spec?: string): this {
    this.state.select = spec;
    return this;
  }
  populate(path: string, select?: string): this {
    const paths = String(path).split(/\s+/).filter(Boolean);
    this.state.populates.push({ paths, select });
    return this;
  }
  lean(): this {
    this.state.lean = true;
    return this;
  }
  collation(): this {
    return this;
  }
  exec(): Promise<T> {
    return this.runner(this.state) as Promise<T>;
  }
  then<R1 = T, R2 = never>(
    onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.exec().then(onFulfilled, onRejected);
  }
  catch<R = never>(onRejected?: ((reason: any) => R | PromiseLike<R>) | null): Promise<T | R> {
    return this.exec().catch(onRejected);
  }
  finally(onFinally?: (() => void) | null): Promise<T> {
    return this.exec().finally(onFinally);
  }
}

function buildUrl(cfg: ModelConfig<any>, state: QueryState, single: boolean): string {
  const { query, js } = translateFilter(cfg, state.filter);
  const norm = normalizeSortSpec(state.sort);
  const postFilter = js.length > 0;
  const params: string[] = [];
  if (query) params.push(query);
  if (postFilter) {
    params.push('limit=100000');
  } else {
    if (Object.keys(norm).length > 0) params.push(`order=${orderParam(state.sort)}`);
    if (state.skip) params.push(`offset=${state.skip}`);
    const lim = single ? 1 : state.limit;
    if (lim !== undefined) params.push(`limit=${lim}`);
  }
  return `/${cfg.table}${params.length ? `?${params.join('&')}` : ''}`;
}

function orderParam(spec?: SortSpec): string {
  const norm = normalizeSortSpec(spec);
  return Object.entries(norm)
    .map(([key, dir]) => `${dbPath(key)}.${dir === -1 || dir === 'desc' ? 'desc' : 'asc'}`)
    .join(',');
}

function sortCamels(rows: any[], norm: Record<string, SortDirection>): void {
  const entries = Object.entries(norm);
  if (entries.length === 0) return;
  rows.sort((a, b) => {
    for (const [key, dir] of entries) {
      const d = cmp(getPath(a, key), getPath(b, key));
      if (d !== 0) return dir === -1 || dir === 'desc' ? -d : d;
    }
    return 0;
  });
}

async function runFind(cfg: ModelConfig<any>, state: QueryState, single: boolean): Promise<any> {
  const { js } = translateFilter(cfg, state.filter);
  const postFilter = js.length > 0;
  const url = buildUrl(cfg, state, single);
  const raw = await restJson(url);
  let camels: any[] = (Array.isArray(raw) ? raw : []).map((r) => mapRowToCamel(cfg, r));

  if (postFilter) {
    camels = camels.filter((row) => js.every((f) => f(row)));
    const norm = normalizeSortSpec(state.sort);
    sortCamels(camels, norm);
    const skip = state.skip ?? 0;
    const lim = single ? 1 : state.limit;
    camels = camels.slice(skip, lim !== undefined ? skip + lim : undefined);
  } else if (single) {
    camels = camels.slice(0, 1);
  }

  const selection = resolveSelection(cfg, state.select);
  const popPaths = new Set<string>();
  for (const p of state.populates) for (const path of p.paths) popPaths.add(path);

  const docs = camels.map((c) => toDoc(cfg, c, state.lean));
  if (state.populates.length > 0) await runPopulate(cfg, docs, state.populates, state.lean);
  for (const p of popPaths) selection.add(p);
  for (const d of docs) applyProjection(d, selection);

  return single ? (docs[0] ?? null) : docs;
}

async function runPopulate(
  cfg: ModelConfig<any>,
  docs: any[],
  specs: PopulateSpec[],
  lean: boolean,
): Promise<void> {
  for (const spec of specs) {
    for (const path of spec.paths) {
      const factory = cfg.refs?.[path];
      if (!factory) continue;
      const refModel: any = factory();
      const refCfg: ModelConfig<any> = refModel.config;
      const ids = Array.from(
        new Set(docs.map((d) => resolveId(d[path])).filter((x) => x !== undefined && x !== null)),
      );
      if (ids.length === 0) continue;

      const refQuery: any = refModel.find({ _id: { $in: ids } });
      const refDocs: any[] = lean ? await refQuery.lean() : await refQuery;
      const byId = new Map<string, any>(refDocs.map((d) => [String(d._id), d]));

      const selection = resolveSelection(refCfg, spec.select);
      for (const d of docs) {
        const id = resolveId(d[path]);
        const ref = id != null ? byId.get(String(id)) : undefined;
        if (ref && !lean) applyProjection(ref, selection);
        else if (ref && lean) applyProjection(ref, selection);
        d[path] = ref ?? null;
      }
    }
  }
}

async function fetchFiltered(cfg: ModelConfig<any>, filter: Filter): Promise<any[]> {
  const { query, js } = translateFilter(cfg, filter);
  const params: string[] = [];
  if (query) params.push(query);
  if (js.length > 0) params.push('limit=100000');
  const raw = await restJson(`/${cfg.table}${params.length ? `?${params.join('&')}` : ''}`);
  let camels: any[] = (Array.isArray(raw) ? raw : []).map((r) => mapRowToCamel(cfg, r));
  if (js.length > 0) camels = camels.filter((row) => js.every((f) => f(row)));
  return camels;
}

async function countWhere(cfg: ModelConfig<any>, filter: Filter): Promise<number> {
  const { query, js } = translateFilter(cfg, filter);
  if (js.length > 0) return (await fetchFiltered(cfg, filter)).length;
  const params = ['select=_id', 'limit=0'];
  if (query) params.push(query);
  const res = await rest(`/${cfg.table}?${params.join('&')}`, {
    headers: { Prefer: 'count=exact' },
  });
  return countFrom(res) ?? 0;
}

async function existsWhere(cfg: ModelConfig<any>, filter: Filter): Promise<{ _id: any } | null> {
  const state: QueryState = { filter, select: '_id', populates: [], lean: true };
  const doc = await runFind(cfg, state, true);
  return doc ? { _id: doc._id } : null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function toDbRow(cfg: ModelConfig<any>, input: any): Record<string, any> {
  const row: Record<string, any> = {};
  if (input && input._id !== undefined && input._id !== null) row._id = input._id;
  for (const col of cfg.columns) {
    if (Object.prototype.hasOwnProperty.call(input, col)) {
      const v = input[col];
      if (v !== undefined) row[col.toLowerCase()] = v;
    }
  }
  if (cfg.columns.includes('createdAt' as any) && !('createdat' in row)) {
    row.createdat = new Date().toISOString();
  }
  if (cfg.columns.includes('updatedAt' as any) && !('updatedat' in row)) {
    row.updatedat = new Date().toISOString();
  }
  return row;
}

async function insertOne(cfg: ModelConfig<any>, input: any): Promise<any> {
  const rows = await insertManyRows(cfg, [input]);
  return rows[0];
}

async function insertManyRows(cfg: ModelConfig<any>, docs: any[]): Promise<any[]> {
  if (docs.length === 0) return [];
  const rows = docs.map((d) => toDbRow(cfg, d));
  const inserted = await restJson(`/${cfg.table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
  return (Array.isArray(inserted) ? inserted : []).map((r) => mapRowToCamel(cfg, r));
}

function pullMatch(elem: any, cond: any): boolean {
  if (isPlainObject(cond)) {
    if ('$in' in cond) return toArray(cond.$in).some((x) => looseEq(elem, x));
    return deepEq(elem, cond);
  }
  return looseEq(elem, cond);
}

function applyUpdateToCamel(
  cfg: ModelConfig<any>,
  obj: any,
  update: any,
  pre: any,
): Record<string, any> {
  const changed: Record<string, any> = {};
  const setField = (key: string, value: any) => {
    obj[key] = value;
    changed[key] = value;
  };

  const hasOps = Object.keys(update).some((k) => k.startsWith('$'));
  if (!hasOps) {
    for (const [k, v] of Object.entries(update)) setField(k, v === undefined ? null : v);
  } else {
    for (const [op, val] of Object.entries(update)) {
      if (!op.startsWith('$')) {
        setField(op, val === undefined ? null : val);
        continue;
      }
      const spec = (val ?? {}) as Record<string, any>;
      if (op === '$set') {
        for (const [k, v] of Object.entries(spec)) setField(k, v === undefined ? null : v);
      } else if (op === '$unset') {
        for (const k of Object.keys(spec)) setField(k, null);
      } else if (op === '$inc') {
        for (const [k, v] of Object.entries(spec)) setField(k, (Number(obj[k]) || 0) + Number(v));
      } else if (op === '$addToSet') {
        for (const [k, v] of Object.entries(spec)) {
          const arr = Array.isArray(obj[k]) ? [...obj[k]] : [];
          const add = isPlainObject(v) && '$each' in v ? (v.$each as any[]) : [v];
          for (const x of add) if (!arr.some((e) => looseEq(e, x))) arr.push(x);
          setField(k, arr);
        }
      } else if (op === '$pull') {
        for (const [k, v] of Object.entries(spec)) {
          const arr = Array.isArray(obj[k]) ? obj[k] : [];
          setField(
            k,
            arr.filter((e: any) => !pullMatch(e, v)),
          );
        }
      }
    }
  }

  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(changed)) {
    if (!deepEq(v, pre[k])) patch[k.toLowerCase()] = v === undefined ? null : v;
  }
  if (Object.keys(changed).length > 0 && cfg.columns.includes('updatedAt' as any)) {
    patch['updatedat'] = new Date().toISOString();
  }
  return patch;
}

interface UpdateRun {
  updatedDocs: any[];
  pre: any[];
  result: UpdateResult;
}

async function runUpdate(
  cfg: ModelConfig<any>,
  filter: Filter,
  update: any,
  opts: UpdateOptions | undefined,
  many: boolean,
): Promise<UpdateRun> {
  let camels = await fetchFiltered(cfg, filter);
  if (!many) camels = camels.slice(0, 1);

  if (camels.length === 0) {
    void opts;
    return {
      updatedDocs: [],
      pre: [],
      result: { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: null },
    };
  }

  let modified = 0;
  const pre: any[] = [];
  for (const c of camels) {
    const before = structuredClone(c);
    pre.push(before);
    const patch = applyUpdateToCamel(cfg, c, update, before);
    if (Object.keys(patch).length > 0) {
      await rest(`/${cfg.table}?_id=eq.${encodeURIComponent(c._id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
      modified += 1;
    }
  }
  return {
    updatedDocs: camels,
    pre,
    result: {
      acknowledged: true,
      matchedCount: camels.length,
      modifiedCount: modified,
      upsertedId: null,
    },
  };
}

async function deleteWhere(cfg: ModelConfig<any>, filter: Filter): Promise<number> {
  const { query, js } = translateFilter(cfg, filter);
  if (js.length > 0) {
    const camels = (await fetchFiltered(cfg, filter)).map((r) => r);
    const ids = camels.map((c) => c._id);
    if (ids.length === 0) return 0;
    const res = await rest(`/${cfg.table}?_id=in.${inList(ids)}`, {
      method: 'DELETE',
      headers: { Prefer: 'count=exact' },
    });
    return countFrom(res) ?? ids.length;
  }
  const res = await rest(`/${cfg.table}${query ? `?${query}` : ''}`, {
    method: 'DELETE',
    headers: { Prefer: 'count=exact' },
  });
  return countFrom(res) ?? 0;
}

async function insertMerged(cfg: ModelConfig<any>, filter: Filter, update: any): Promise<any> {
  const base: any = {};
  for (const [k, v] of Object.entries(filter)) {
    if (k.startsWith('$')) continue;
    if (isPlainObject(v) && Object.keys(v).some((x) => x.startsWith('$'))) continue;
    base[k] = resolveId(v);
  }
  applyUpdateToCamel(cfg, base, update, structuredClone(base));
  const camel = await insertOne(cfg, base);
  return camel;
}

async function saveDoc(cfg: ModelConfig<any>, obj: any): Promise<any> {
  const snapshot = obj.__snapshot ?? {};
  const patch: Record<string, any> = {};
  for (const col of cfg.columns) {
    if (!Object.prototype.hasOwnProperty.call(obj, col)) continue;
    let cur = obj[col];
    if (cur && typeof cur === 'object' && '_id' in cur) cur = cur._id;
    const snap = snapshot[col];
    if (cur === undefined && snap === undefined) continue;
    if (!deepEq(cur, snap)) patch[col.toLowerCase()] = cur === undefined ? null : cur;
  }
  if (cfg.columns.includes('updatedAt' as any)) patch['updatedat'] = new Date().toISOString();
  if (Object.keys(patch).length === 0) return obj;

  const rows = await restJson(`/${cfg.table}?_id=eq.${encodeURIComponent(obj._id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  const fresh = Array.isArray(rows) && rows[0] ? mapRowToCamel(cfg, rows[0]) : null;
  if (fresh) {
    for (const key of Object.keys(fresh)) obj[key] = fresh[key];
    obj.id = obj._id;
    obj.__snapshot = structuredClone(fresh);
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Aggregation (only the stages this backend uses)
// ---------------------------------------------------------------------------

function accumulate(acc: any, docs: any[]): any {
  if (typeof acc === 'number') return acc;
  if (!isPlainObject(acc)) return acc;
  if ('$sum' in acc) {
    const v = acc.$sum;
    if (typeof v === 'string' && v.startsWith('$')) {
      const path = v.slice(1);
      return docs.reduce((sum, d) => sum + (Number(getPath(d, path)) || 0), 0);
    }
    return docs.reduce((sum, d) => sum + (Number(v) || 0), 0);
  }
  if ('$avg' in acc) {
    const path =
      typeof acc.$avg === 'string' && acc.$avg.startsWith('$') ? acc.$avg.slice(1) : null;
    const values = docs
      .map((d) => (path ? Number(getPath(d, path)) : Number(acc.$avg)))
      .filter((n) => Number.isFinite(n));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
  if ('$min' in acc) {
    const path = String(acc.$min).replace('$', '');
    const values = docs.map((d) => getPath(d, path)).filter((v) => v != null);
    return values.length ? values.reduce((a, b) => (cmp(a, b) < 0 ? a : b)) : null;
  }
  if ('$max' in acc) {
    const path = String(acc.$max).replace('$', '');
    const values = docs.map((d) => getPath(d, path)).filter((v) => v != null);
    return values.length ? values.reduce((a, b) => (cmp(a, b) > 0 ? a : b)) : null;
  }
  if ('$first' in acc) {
    const path = String(acc.$first).replace('$', '');
    return docs.length ? getPath(docs[0], path) : null;
  }
  if ('$last' in acc) {
    const path = String(acc.$last).replace('$', '');
    return docs.length ? getPath(docs[docs.length - 1], path) : null;
  }
  if ('$push' in acc) {
    const path = typeof acc.$push === 'string' ? acc.$push.replace('$', '') : null;
    return docs.map((d) => (path ? getPath(d, path) : d));
  }
  if ('$addToSet' in acc) {
    const path = String(acc.$addToSet).replace('$', '');
    const out: any[] = [];
    for (const d of docs) {
      const v = getPath(d, path);
      if (!out.some((e) => looseEq(e, v))) out.push(v);
    }
    return out;
  }
  return null;
}

function groupRows(spec: any, rows: any[]): any[] {
  const groups = new Map<string, { _id: any; docs: any[] }>();
  for (const row of rows) {
    let idv: any = null;
    if (typeof spec._id === 'string' && spec._id.startsWith('$'))
      idv = getPath(row, spec._id.slice(1));
    else if (spec._id !== null && spec._id !== undefined) idv = spec._id;
    const key = idv === null ? 'null' : JSON.stringify(idv);
    if (!groups.has(key)) groups.set(key, { _id: idv, docs: [] });
    groups.get(key)!.docs.push(row);
  }
  return Array.from(groups.values()).map((g) => {
    const out: any = { _id: g._id };
    for (const [field, acc] of Object.entries(spec)) {
      if (field === '_id') continue;
      out[field] = accumulate(acc, g.docs);
    }
    return out;
  });
}

async function runAggregate(cfg: ModelConfig<any>, pipeline: any[]): Promise<any[]> {
  const match = pipeline.find((s) => s && s.$match);
  let rows: any[];
  if (match) {
    rows = await fetchFiltered(cfg, match.$match);
  } else {
    const raw = await restJson(`/${cfg.table}`);
    rows = (Array.isArray(raw) ? raw : []).map((r) => mapRowToCamel(cfg, r));
  }

  const group = pipeline.find((s) => s && s.$group);
  let out = rows;
  if (group) out = groupRows(group.$group, out);

  const sort = pipeline.find((s) => s && s.$sort);
  if (sort) {
    const norm = normalizeSortSpec(sort.$sort);
    sortCamels(out, norm);
  }
  const skip = pipeline.find((s) => s && s.$skip);
  if (skip) out = out.slice(skip.$skip);
  const limit = pipeline.find((s) => s && s.$limit);
  if (limit) out = out.slice(0, limit.$limit);
  return out;
}

// ---------------------------------------------------------------------------
// Model factory
// ---------------------------------------------------------------------------

function query<T>(runner: (state: QueryState) => Promise<any>, filter?: Filter): Query<T> {
  return new Query<T>(runner, filter ?? {});
}

export function defineModel<T>(cfg: ModelConfig<T>): ModelApi<T> {
  const config = cfg as ModelConfig<any>;

  const api: any = {
    table: cfg.table,
    config,

    find(filter?: Filter, projection?: string | Record<string, any>): Query<T> {
      const q = query<T>((s) => runFind(config, s, false), filter);
      if (typeof projection === 'string') q.select(projection);
      return q;
    },
    findOne(filter?: Filter, projection?: string | Record<string, any>): Query<T> {
      const q = query<T>((s) => runFind(config, s, true), filter);
      if (typeof projection === 'string') q.select(projection);
      return q;
    },
    findById(id: any, projection?: string | Record<string, any>): Query<T> {
      const q = query<T>((s) => runFind(config, s, true), { _id: resolveId(id) });
      if (typeof projection === 'string') q.select(projection);
      return q;
    },
    countDocuments(filter?: Filter): Query<number> {
      return query<number>(() => countWhere(config, filter ?? {}));
    },
    estimatedDocumentCount(): Query<number> {
      return query<number>(() => countWhere(config, {}));
    },
    exists(filter?: Filter): Query<{ _id: any } | null> {
      return query<{ _id: any } | null>(() => existsWhere(config, filter ?? {}));
    },
    create(input: any): Query<T> {
      return query<T>(async () => {
        const camel = await insertOne(config, input ?? {});
        return toDoc(config, camel, false);
      });
    },
    insertMany(docs: any[]): Query<T[]> {
      return query<T[]>(async () => {
        const camels = await insertManyRows(config, docs ?? []);
        return camels.map((c) => toDoc(config, c, false));
      });
    },
    updateOne(filter: Filter, update: any, options?: UpdateOptions): Query<UpdateResult> {
      return query<UpdateResult>(
        async () => (await runUpdate(config, filter ?? {}, update ?? {}, options, false)).result,
      );
    },
    updateMany(filter: Filter, update: any, options?: UpdateOptions): Query<UpdateResult> {
      return query<UpdateResult>(
        async () => (await runUpdate(config, filter ?? {}, update ?? {}, options, true)).result,
      );
    },
    findOneAndUpdate(filter: Filter, update: any, options?: UpdateOptions): Query<T | null> {
      return query<T | null>(async () => {
        const { updatedDocs, pre } = await runUpdate(
          config,
          filter ?? {},
          update ?? {},
          options,
          false,
        );
        if (updatedDocs.length === 0) {
          if (options?.upsert) {
            const camel = await insertMerged(config, filter ?? {}, update ?? {});
            return toDoc(config, camel, false);
          }
          return null;
        }
        const chosen = options?.new ? updatedDocs[0] : (pre[0] ?? updatedDocs[0]);
        return toDoc(config, chosen, false);
      });
    },
    findByIdAndUpdate(id: any, update: any, options?: UpdateOptions): Query<T | null> {
      return api.findOneAndUpdate({ _id: resolveId(id) }, update, options);
    },
    deleteOne(filter?: Filter): Query<DeleteResult> {
      return query<DeleteResult>(async () => ({
        acknowledged: true,
        deletedCount: await deleteWhere(config, filter ?? {}),
      }));
    },
    deleteMany(filter?: Filter): Query<DeleteResult> {
      return query<DeleteResult>(async () => ({
        acknowledged: true,
        deletedCount: await deleteWhere(config, filter ?? {}),
      }));
    },
    findByIdAndDelete(id: any): Query<DeleteResult> {
      return query<DeleteResult>(async () => ({
        acknowledged: true,
        deletedCount: await deleteWhere(config, { _id: resolveId(id) }),
      }));
    },
    aggregate<R = any>(pipeline: any[]): Query<R[]> {
      return query<R[]>(() => runAggregate(config, pipeline ?? []));
    },
  };

  return api;
}
