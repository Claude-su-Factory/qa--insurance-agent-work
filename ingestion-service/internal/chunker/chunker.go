package chunker

import "strings"

// Chunker는 텍스트를 슬라이딩 윈도우로 청킹하는 인터페이스다.
type Chunker interface {
	Chunk(text string, chunkSize, overlap int) []string
}

type WordChunker struct{}

func New() Chunker {
	return &WordChunker{}
}

// Chunk는 텍스트를 단어 단위로 슬라이딩 윈도우 청킹한다.
// chunkSize: 청크당 최대 단어 수 (토큰 근사값으로 사용)
// overlap: 연속 청크 간 중복 단어 수
func (w *WordChunker) Chunk(text string, chunkSize, overlap int) []string {
	if chunkSize <= 0 {
		chunkSize = 1
	}
	if overlap < 0 {
		overlap = 0
	}

	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}

	step := chunkSize - overlap
	if step <= 0 {
		step = 1
	}

	var chunks []string
	for i := 0; i < len(words); i += step {
		end := i + chunkSize
		if end > len(words) {
			end = len(words)
		}
		chunks = append(chunks, strings.Join(words[i:end], " "))
		if end == len(words) {
			break
		}
	}
	return chunks
}

var _ Chunker = (*WordChunker)(nil)
