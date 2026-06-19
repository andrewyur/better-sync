package routes

import (
	"database/sql"
	"log"
	"path"
	"time"

	_ "modernc.org/sqlite"
)

type Server struct {
	dataDir string
	db      *sql.DB
}

func NewServer(
	dataDir string,
) (Server, error) {
	db, err := sql.Open("sqlite", path.Join(dataDir, "better-sync.db"))
	if err != nil {
		return Server{}, err
	}

	s := Server{
		dataDir: dataDir,
		db:      db,
	}

	err = s.initDb()

	go s.startCleanup()
	
	return s, err
}

func (s *Server) startCleanup() {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		err := s.clearTombstones()
		if err != nil {
			log.Fatalf("cleanup error: %s", err.Error())
		}
	}
}
