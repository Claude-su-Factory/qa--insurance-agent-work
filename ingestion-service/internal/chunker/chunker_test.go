package chunker_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/chunker"
)

func TestChunk_BasicSliding(t *testing.T) {
	// 10개 단어, size=5, overlap=2 → step=3
	words := make([]string, 10)
	for i := range words {
		words[i] = fmt.Sprintf("w%d", i)
	}
	text := strings.Join(words, " ")

	c := chunker.New()
	chunks := c.Chunk(text, 5, 2)

	// i=0: w0~w4, i=3: w3~w7, i=6: w6~w9(end)
	require.Len(t, chunks, 3)
	assert.Equal(t, "w0 w1 w2 w3 w4", chunks[0])
	assert.Equal(t, "w3 w4 w5 w6 w7", chunks[1])
	assert.Equal(t, "w6 w7 w8 w9", chunks[2])
}

func TestChunk_TextShorterThanChunkSize(t *testing.T) {
	c := chunker.New()
	chunks := c.Chunk("짧은 텍스트", 512, 50)
	require.Len(t, chunks, 1)
	assert.Equal(t, "짧은 텍스트", chunks[0])
}

func TestChunk_EmptyText(t *testing.T) {
	c := chunker.New()
	chunks := c.Chunk("", 512, 50)
	assert.Empty(t, chunks)
}

func TestChunk_ZeroChunkSize(t *testing.T) {
	c := chunker.New()
	chunks := c.Chunk("w0 w1 w2", 0, 0)
	// chunkSize=0 → clamp to 1 → 3 chunks of 1 word each
	assert.NotEmpty(t, chunks)
	require.Len(t, chunks, 3)
	assert.Equal(t, "w0", chunks[0])
	assert.Equal(t, "w1", chunks[1])
	assert.Equal(t, "w2", chunks[2])
}

func TestChunk_NegativeOverlap(t *testing.T) {
	c := chunker.New()
	// negative overlap treated as 0 → no gap, no overlap
	chunks := c.Chunk("w0 w1 w2 w3 w4", 3, -1)
	assert.NotEmpty(t, chunks)
	// chunkSize=3, overlap=0 (clamped from -1) → step=3
	// i=0: w0 w1 w2, i=3: w3 w4
	require.Len(t, chunks, 2)
	assert.Equal(t, "w0 w1 w2", chunks[0])
	assert.Equal(t, "w3 w4", chunks[1])
}
