package routes

import (
	"net/http"
	"os"
	"path"
	"strconv"
)

func (s *Server) HandleDelete(w http.ResponseWriter, r *http.Request) {
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
	if fullPath == vaultPath {
		http.Error(w, "tried to delete entire vault", http.StatusInternalServerError)
		return
	}
	err = os.RemoveAll(fullPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if record != nil {
		record.Deleted = true
		record.ModifiedAt = modifiedAt
		err = s.insertOrUpdateRecord(vaultId, filePath, *record)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
}
