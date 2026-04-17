package embedder_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/embedder"
)

type MockEmbedder struct {
	Vectors [][]float32
	Err     error
}

func (m *MockEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	if m.Err != nil {
		return nil, m.Err
	}
	result := make([][]float32, len(texts))
	for i := range texts {
		result[i] = m.Vectors[i%len(m.Vectors)]
	}
	return result, nil
}

func TestMockEmbedder_Embed(t *testing.T) {
	mock := &MockEmbedder{
		Vectors: [][]float32{{0.1, 0.2, 0.3}},
	}
	vecs, err := mock.Embed(context.Background(), []string{"텍스트1", "텍스트2"})
	require.NoError(t, err)
	assert.Len(t, vecs, 2)
}

func TestMockEmbedder_EmbedError(t *testing.T) {
	mock := &MockEmbedder{Err: assert.AnError}
	_, err := mock.Embed(context.Background(), []string{"텍스트"})
	assert.Error(t, err)
}

// VoyageEmbedder가 Embedder 인터페이스를 구현하는지 컴파일 타임 확인
var _ embedder.Embedder = (*embedder.VoyageEmbedder)(nil)
