package routes

import (
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
)

func (s *Server) HandleUploadFile(w http.ResponseWriter, r *http.Request) {
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

	content, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fullPath := path.Join(s.dataDir, "vaults", vaultId, filePath)
	err = os.MkdirAll(filepath.Dir(fullPath), 0755)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	err = os.WriteFile(fullPath, content, 0655)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	err = s.insertOrUpdateRecord(vaultId, filePath, modifiedAt, false)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
