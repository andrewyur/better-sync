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
	Dir        bool   `json:"dir"`
}

func (s *Server) HandleState(w http.ResponseWriter, r *http.Request) {
	vaultId := r.PathValue("id")

	vaultPath := path.Join(s.dataDir, "vaults", vaultId)
	fileState, err := getFileState(vaultPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	dbState, err := s.getDbState(vaultId)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Trust file system in cases of desync
	for filePath, state := range fileState {
		if _, ok := dbState[filePath]; !ok {
			stat, err := os.Stat(path.Join(vaultPath, filePath))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			entry := StateEntry{
				ModifiedAt: stat.ModTime().Unix(),
				Dir:        state.Dir,
			}
			err = s.insertOrUpdateRecord(vaultId, filePath, entry)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			dbState[filePath] = entry
		}
	}
	for filePath := range dbState {
		if _, ok := fileState[filePath]; !ok {
			err := s.deleteRecord(vaultId, filePath)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			delete(dbState, filePath)
		}
	}

	for k, v := range dbState {
		v.Hash = fileState[k].Hash
		v.Dir = fileState[k].Dir
		dbState[k] = v
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dbState)
}

func getFileState(vaultPath string) (map[string]StateEntry, error) {
	_, err := os.Stat(vaultPath)
	if os.IsNotExist(err) {
		return nil, fmt.Errorf("vault does not exist: %s", vaultPath)
	}

	fileState := make(map[string]StateEntry)

	err = fs.WalkDir(os.DirFS(vaultPath), ".", func(
		relPath string,
		d fs.DirEntry,
		err error,
	) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if relPath != "." {
				fileState[relPath] = StateEntry{
					Dir: true,
				}
			}
			return nil
		}

		fullPath := path.Join(vaultPath, relPath)
		hash, err := hashFile(fullPath)
		if err != nil {
			return err
		}

		fileState[relPath] = StateEntry{
			Hash: hash,
		}
		return nil
	})

	return fileState, err
}

func hashFile(filePath string) (string, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}

	hash := sha256.Sum256(content)
	return fmt.Sprintf("%x", hash), nil
}
