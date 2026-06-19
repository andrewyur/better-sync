package routes

import (
	"net/http"
	"os"
	"path"
)

func (s *Server) HandleReadFile(w http.ResponseWriter, r *http.Request) {
	vaultId := r.PathValue("id")
	filePath := r.PathValue("path")

	vaultPath := path.Join(s.dataDir, "vaults", vaultId)
	fullPath := path.Join(vaultPath, filePath)

	file, err := os.ReadFile(fullPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = w.Write(file)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}
