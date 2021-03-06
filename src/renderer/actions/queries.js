import { cloneDeep } from 'lodash';
import csvStringify from 'csv-stringify';
import { clipboard } from 'electron';
import { getCurrentDBConn } from './connections';
import { rowsValuesToString } from '../utils/convert';
import wait from '../utils/wait';


export const NEW_QUERY = 'NEW_QUERY';
export const SELECT_QUERY = 'SELECT_QUERY';
export const REMOVE_QUERY = 'REMOVE_QUERY';
export const EXECUTE_QUERY_REQUEST = 'EXECUTE_QUERY_REQUEST';
export const EXECUTE_QUERY_SUCCESS = 'EXECUTE_QUERY_SUCCESS';
export const EXECUTE_QUERY_FAILURE = 'EXECUTE_QUERY_FAILURE';
export const COPY_QUERY_RESULT_TO_CLIPBOARD_REQUEST = 'COPY_QUERY_RESULT_TO_CLIPBOARD_REQUEST';
export const COPY_QUERY_RESULT_TO_CLIPBOARD_SUCCESS = 'COPY_QUERY_RESULT_TO_CLIPBOARD_SUCCESS';
export const COPY_QUERY_RESULT_TO_CLIPBOARD_FAILURE = 'COPY_QUERY_RESULT_TO_CLIPBOARD_FAILURE';
export const UPDATE_QUERY = 'UPDATE_QUERY';


export function newQuery (database) {
  return { type: NEW_QUERY, database };
}


export function selectQuery (id) {
  return { type: SELECT_QUERY, id };
}


export function removeQuery (id) {
  return { type: REMOVE_QUERY, id };
}


export function executeQueryIfNeeded (query) {
  return (dispatch, getState) => {
    if (shouldExecuteQuery(query, getState())) {
      return dispatch(executeQuery(query));
    }
  };
}


export function executeDefaultSelectQueryIfNeeded (table) {
  return async (dispatch, getState) => {
    const dbConn = getCurrentDBConn(getState());
    const query = await dbConn.getQuerySelectTop(table);
    if (shouldExecuteQuery(query, getState())) {
      return dispatch(executeQuery(query, true));
    }
  };
}


export function updateQuery (query) {
  return { type: UPDATE_QUERY, query };
}


export function copyToClipboard (rows, type) {
  return async dispatch => {
    dispatch({ type: COPY_QUERY_RESULT_TO_CLIPBOARD_REQUEST });
    try {
      let value;
      if (type === 'CSV') {
        value = await stringifyResultToCSV(rows);
      } else {
        // force the next dispatch be separately
        // handled of the previous one
        await wait(0);
        value = JSON.stringify(rows, null, 2);
      }
      clipboard.writeText(value);
      dispatch({ type: COPY_QUERY_RESULT_TO_CLIPBOARD_SUCCESS });
    } catch (error) {
      dispatch({ type: COPY_QUERY_RESULT_TO_CLIPBOARD_FAILURE, error });
    }
  };
}


function shouldExecuteQuery (query, state) {
  const currentQuery = state.queries.queriesById[state.queries.currentQueryId];
  if (!currentQuery) return true;
  if (currentQuery.isExecuting) return false;
  const previousQuery = currentQuery.queryHistory[currentQuery.queryHistory.length - 1];
  if (previousQuery !== query) return true;
  return currentQuery.didInvalidate;
}


function executeQuery (query, isDefaultSelect = false) {
  return async (dispatch, getState) => {
    dispatch({ type: EXECUTE_QUERY_REQUEST, query, isDefaultSelect });
    try {
      const dbConn = getCurrentDBConn(getState());
      const remoteResult = await dbConn.executeQuery(query);

      // Remove any "reference" to the remote IPC object
      const results = cloneDeep(remoteResult);

      dispatch({ type: EXECUTE_QUERY_SUCCESS, query, results });
    } catch (error) {
      dispatch({ type: EXECUTE_QUERY_FAILURE, query, error });
    }
  };
}


function stringifyResultToCSV(rows) {
  if (!rows.length) {
    return '';
  }

  const header = Object.keys(rows[0]).reduce((_header, col) => {
    _header[col] = col;
    return _header;
  }, {});

  const data = [
    header,
    ...rowsValuesToString(rows),
  ];

  return new Promise((resolve, reject) => {
    csvStringify(data, function(err, csv) {
      if (err) { return reject(err); }
      resolve(csv);
    });
  });
}
