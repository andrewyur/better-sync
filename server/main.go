package main

import (
	"fmt"
	"log"
	"net/http"
	//"github.com/andrewyur/better-sync/routes"

	"github.com/andrewyur/better-sync/routes"
)

const dataFolder = "./data"

func main() {
	mux := http.NewServeMux()

	s, err := routes.NewServer(dataFolder)
	if err != nil {
		log.Fatal(err)
	}

	mux.HandleFunc("GET /bing", handleBing)
	mux.HandleFunc("POST /vault", s.HandleCreateVault)
	mux.HandleFunc("GET /vault", s.HandleListVaults)
	mux.HandleFunc("GET /vault/{id}/state", s.HandleState)
	mux.HandleFunc("POST /vault/{id}/file/{path...}", s.HandleUpload)
	mux.HandleFunc("DELETE /vault/{id}/file/{path...}", s.HandleDelete)
	mux.HandleFunc("GET /vault/{id}/file/{path...}", s.HandleReadFile)

	log.Println("listening on port :8080")

	handler := withLogging(withCORS(mux))
	log.Fatal(http.ListenAndServe(":8080", handler))
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Modified-At, X-Is-Dir")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}

func handleBing(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprintf(w, "bong")
}
