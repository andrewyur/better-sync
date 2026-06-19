package routes

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
)

type StateEntry struct {
	Hash       string `json:"hash"`
	ModifiedAt int64  `json:"modifiedAt"`
	Deleted    bool   `json:"deleted"`
}

func (s *Server) HandleState(w http.ResponseWriter, r *http.Request) {
	vaultId := r.PathValue("id")

	vaultPath := path.Join(s.dataDir, "vaults", vaultId)
	hashes, err := generateHashes(vaultPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	state, err := s.getDbState(vaultId)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Trust file system in cases of desync
	for filePath := range hashes {
		if _, ok := state[filePath]; !ok {
			stat, err := os.Stat(path.Join(vaultPath, filePath))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			err = s.insertOrUpdateRecord(vaultId, filePath, stat.ModTime().Unix(), false)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}
	for filePath := range state {
		if _, ok := hashes[filePath]; !ok {
			err := s.deleteRecord(vaultId, filePath)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			delete(state, filePath)
		}
	}

	for k, v := range state {
		v.Hash = hashes[k]
		state[k] = v
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

func generateHashes(vaultPath string) (map[string]string, error) {
	_, err := os.Stat(vaultPath)
	if os.IsNotExist(err) {
		return nil, fmt.Errorf("vault does not exist: %s", vaultPath)
	}

	hashes := make(map[string]string)

	err = fs.WalkDir(os.DirFS(vaultPath), ".", func(
		relPath string,
		d fs.DirEntry,
		err error,
	) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}

		fullPath := path.Join(vaultPath, relPath)
		hash, err := hashFile(fullPath)
		if err != nil {
			return err
		}

		hashes[relPath] = hash
		return nil
	})

	return hashes, err
}

func hashFile(filePath string) (string, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}

	hash := sha256.Sum256(content)
	return fmt.Sprintf("%x", hash), nil
}
