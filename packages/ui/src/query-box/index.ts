// @ga/ui/query-box — ô truy vấn (DATABASE §8.1): phân tích, kiểm whitelist, chip, đánh giá phía client.
export type { QueryBoxLabels } from '../datagrid/labels.ts';
export { compileQuery, type EvalContext } from './evaluate.ts';
export {
  DEFAULT_OPS,
  findField,
  ID_FIELD,
  type QueryField,
  type QueryFieldType,
  type ResolvedClause,
  type ResolvedValue,
  resolveQuery,
} from './fields.ts';
export { FOLD_MAX_CHARS, foldVi } from './fold.ts';
export {
  clauseText,
  joinClauses,
  parseQuery,
  QUERY_MAX_CHARS,
  QUERY_MAX_CLAUSES,
  QUERY_OPS,
  type QueryAtom,
  type QueryClause,
  type QueryError,
  type QueryOp,
  removeClause,
} from './parse.ts';
export { QueryBox, type QueryBoxProps } from './QueryBox.tsx';
