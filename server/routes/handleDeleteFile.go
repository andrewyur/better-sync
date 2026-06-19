package routes

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
)

func (s *Server) HandleDeleteFile(w http.ResponseWriter, r *http.Request) {
	vaultId := r.PathValue("id")
	filePath := r.PathValue("path")

	modifiedAt, err := strconv.ParseInt(r.Header.Get("X-Modified-At"), 10, 64)
	if err != nil {
		http.Error(w, "Invalid X-Modified-At header", http.StatusBadRequest)
		return
	}

	record, err := s.getExistingRecord(vaultId, filePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if record != nil && record.ModifiedAt > modifiedAt {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	vaultPath := path.Join(s.dataDir, "vaults", vaultId)
	fullPath := path.Join(vaultPath, filePath)
	err = os.Remove(fullPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	parent := filepath.Dir(fullPath)
	for parent != vaultPath {
		entries, err := os.ReadDir(parent)
		if err != nil {
			break
		}
		if len(entries) > 0 {
			break
		}
		os.Remove(parent)
		parent = filepath.Dir(parent)
	}

	err = s.insertOrUpdateRecord(vaultId, filePath, modifiedAt, true)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}
