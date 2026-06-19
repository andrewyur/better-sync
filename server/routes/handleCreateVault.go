package routes

import (
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
)

var illegalChars = regexp.MustCompile(`[:/\\]`)

func (s *Server) HandleCreateVault(w http.ResponseWriter, r *http.Request) {
	content, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	text := string(content)

	if illegalChars.MatchString(text) {
		http.Error(w, "ID must not contain the characters :\\/", http.StatusBadRequest)
		return
	}

	err = createVault(text, s.dataDir)
	if err != nil {
		log.Printf("ERROR: %s", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func createVault(id string, dataDir string) error {
	path := filepath.Join(dataDir, "vaults", id)
	_, err := os.Stat(path)

	if os.IsExist(err) {
		return errors.New("vault with that name already exists")
	}

	return os.MkdirAll(path, 0775)
}
