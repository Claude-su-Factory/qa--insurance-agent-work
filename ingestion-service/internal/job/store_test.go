package job_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/job"
)

func TestStore_CreateAndGet(t *testing.T) {
	s := job.NewStore()
	s.Create("job1", "test.pdf")

	status, ok := s.Get("job1")
	assert.True(t, ok)
	assert.Equal(t, "job1", status.JobID)
	assert.Equal(t, "test.pdf", status.Filename)
	assert.Equal(t, job.StepParsing, status.Step)
	assert.Equal(t, 0, status.Progress)
}

func TestStore_Update(t *testing.T) {
	s := job.NewStore()
	s.Create("job1", "test.pdf")
	s.Update("job1", func(st *job.Status) {
		st.Step = job.StepChunking
		st.Progress = 30
		st.TotalChunks = 42
	})

	status, ok := s.Get("job1")
	assert.True(t, ok)
	assert.Equal(t, job.StepChunking, status.Step)
	assert.Equal(t, 30, status.Progress)
	assert.Equal(t, 42, status.TotalChunks)
}

func TestStore_GetNotFound(t *testing.T) {
	s := job.NewStore()
	_, ok := s.Get("nonexistent")
	assert.False(t, ok)
}

func TestStore_UpdateNonExistent(t *testing.T) {
	s := job.NewStore()
	// 존재하지 않는 job 업데이트는 패닉 없이 무시되어야 한다
	assert.NotPanics(t, func() {
		s.Update("ghost", func(st *job.Status) { st.Progress = 100 })
	})
}

func TestStore_DeleteAfter(t *testing.T) {
	s := job.NewStore()
	s.Create("job1", "test.pdf")
	_, exists := s.Get("job1")
	assert.True(t, exists)

	s.DeleteAfter("job1", 50*time.Millisecond)

	time.Sleep(100 * time.Millisecond)
	_, ok := s.Get("job1")
	assert.False(t, ok)
}
