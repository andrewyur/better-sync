package routes

import (
	"database/sql"
	"errors"
	"time"
)

func (s *Server) initDb() error {
	_, err := s.db.Exec("PRAGMA journal_mode=WAL")
	if err != nil {
		return newRouteError(err, "initDb")
	}

	s.db.SetMaxOpenConns(1)

	_, err = s.db.Exec(`
        CREATE TABLE IF NOT EXISTS files (
            path        TEXT NOT NULL,
            vault_id    TEXT NOT NULL,
            modified_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            deleted     INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (vault_id, path)
        );
    `)
	return newRouteError(err, "initDb")
}

func (s *Server) getDbState(vaultId string) (map[string]StateEntry, error) {
	rows, err := s.db.Query(
		"SELECT path, modified_at, deleted FROM files WHERE vault_id = ?",
		vaultId,
	)
	if err != nil {
		return nil, newRouteError(err, "getDbState")
	}
	defer rows.Close()

	state := make(map[string]StateEntry)
	for rows.Next() {
		var path string
		var entry StateEntry
		if err := rows.Scan(&path, &entry.ModifiedAt, &entry.Deleted); err != nil {
			return nil, newRouteError(err, "getDbState")
		}
		state[path] = entry

	}

	return state, newRouteError(rows.Err(), "getDbState")
}

func (s *Server) getExistingRecord(vaultId, path string) (*StateEntry, error) {
	row := s.db.QueryRow("SELECT modified_at, deleted FROM files WHERE vault_id = ? AND path = ?",
		vaultId,
		path,
	)

	var record StateEntry
	err := row.Scan(&record.ModifiedAt, &record.Deleted)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, newRouteError(err, "getExistingRecord")
	}

	return &record, nil
}

func (s *Server) insertOrUpdateRecord(vaultId, filePath string, state StateEntry) error {
	_, err := s.db.Exec("INSERT OR REPLACE INTO files (vault_id, path, modified_at, deleted) VALUES (?, ?, ?, ?)",
		vaultId,
		filePath,
		state.ModifiedAt,
		state.Deleted,
	)

	return newRouteError(err, "insertOrUpdateRecord")
}

func (s *Server) deleteRecord(vaultId, path string) error {
	_, err := s.db.Exec("DELETE FROM files WHERE vault_id = ? AND path = ?",
		vaultId,
		path,
	)

	return newRouteError(err, "deleteRecord")
}

func (s *Server) clearTombstones() error {
	_, err := s.db.Exec("DELETE FROM files WHERE deleted = 1 AND modified_at < ?",
		time.Now().Add(-30*24*time.Hour).Unix(),
	)

	return newRouteError(err, "clearTombstones")
}
