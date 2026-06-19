package routes

import (
	"encoding/json"
	"net/http"
	"os"
	"path"
)

func (s *Server) HandleListVaults(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir(path.Join(s.dataDir, "vaults"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ids := make([]string, len(entries))
	for i, entry := range entries {
		ids[i] = entry.Name()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ids)
}
