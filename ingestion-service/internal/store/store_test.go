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
	LastDocumentID string
	IndexedFields  []string
	Err            error
}

func (m *MockStore) Upsert(_ context.Context, chunks []string, vectors [][]float32, docName string, userID string, documentID string) error {
	if m.Err != nil {
		return m.Err
	}
	m.UpsertedChunks = append(m.UpsertedChunks, chunks...)
	m.LastUserID = userID
	m.LastDocumentID = documentID
	return nil
}

func (m *MockStore) EnsureCollection(_ context.Context, vectorSize uint64) error {
	return m.Err
}

func (m *MockStore) EnsurePayloadIndex(_ context.Context, field string, schema string) error {
	if m.Err != nil {
		return m.Err
	}
	m.IndexedFields = append(m.IndexedFields, field+":"+schema)
	return nil
}

func TestMockStore_Upsert(t *testing.T) {
	mock := &MockStore{}
	err := mock.Upsert(
		context.Background(),
		[]string{"chunk1", "chunk2"},
		[][]float32{{0.1}, {0.2}},
		"삼성생명_암보험",
		"user-uuid-123",
		"doc-uuid-456",
	)
	assert.NoError(t, err)
	assert.Equal(t, []string{"chunk1", "chunk2"}, mock.UpsertedChunks)
	assert.Equal(t, "user-uuid-123", mock.LastUserID)
	assert.Equal(t, "doc-uuid-456", mock.LastDocumentID)
}

func TestMockStore_EnsurePayloadIndex(t *testing.T) {
	mock := &MockStore{}
	err := mock.EnsurePayloadIndex(context.Background(), "user_id", "keyword")
	assert.NoError(t, err)
	assert.Contains(t, mock.IndexedFields, "user_id:keyword")
}

var _ store.Store = (*store.QdrantStore)(nil)
