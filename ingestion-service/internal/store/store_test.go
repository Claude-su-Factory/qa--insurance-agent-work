package store_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/store"
)

type MockStore struct {
	UpsertedChunks []string
	LastUserID     string
	Err            error
}

func (m *MockStore) Upsert(_ context.Context, chunks []string, vectors [][]float32, docName string, userID string) error {
	if m.Err != nil {
		return m.Err
	}
	m.UpsertedChunks = append(m.UpsertedChunks, chunks...)
	m.LastUserID = userID
	return nil
}

func (m *MockStore) EnsureCollection(_ context.Context, vectorSize uint64) error {
	return m.Err
}

func TestMockStore_Upsert(t *testing.T) {
	mock := &MockStore{}
	err := mock.Upsert(
		context.Background(),
		[]string{"chunk1", "chunk2"},
		[][]float32{{0.1}, {0.2}},
		"삼성생명_암보험",
		"user-uuid-123",
	)
	assert.NoError(t, err)
	assert.Equal(t, []string{"chunk1", "chunk2"}, mock.UpsertedChunks)
	assert.Equal(t, "user-uuid-123", mock.LastUserID)
}

// QdrantStore가 Store 인터페이스를 구현하는지 컴파일 타임 확인
var _ store.Store = (*store.QdrantStore)(nil)
