package job

import (
	"sync"
	"time"
)

type Step string

const (
	StepParsing   Step = "parsing"
	StepChunking  Step = "chunking"
	StepEmbedding Step = "embedding"
	StepStoring   Step = "storing"
	StepDone      Step = "done"
	StepFailed    Step = "failed"
)

type Status struct {
	JobID        string    `json:"jobId"`
	Filename     string    `json:"filename"`
	Step         Step      `json:"step"`
	Progress     int       `json:"progress"`
	CurrentChunk int       `json:"currentChunk"`
	TotalChunks  int       `json:"totalChunks"`
	Error        string    `json:"error,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Store struct {
	mu   sync.RWMutex
	jobs map[string]*Status
}

func NewStore() *Store {
	return &Store{jobs: make(map[string]*Status)}
}

func (s *Store) Create(jobID, filename string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jobs[jobID] = &Status{
		JobID:     jobID,
		Filename:  filename,
		Step:      StepParsing,
		Progress:  0,
		CreatedAt: time.Now(),
	}
}

func (s *Store) Update(jobID string, fn func(*Status)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if st, ok := s.jobs[jobID]; ok {
		fn(st)
	}
}

func (s *Store) Get(jobID string) (*Status, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	st, ok := s.jobs[jobID]
	if !ok {
		return nil, false
	}
	copy := *st
	return &copy, true
}

func (s *Store) DeleteAfter(jobID string, d time.Duration) {
	time.AfterFunc(d, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		delete(s.jobs, jobID)
	})
}
