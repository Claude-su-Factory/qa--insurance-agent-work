package parser_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/yourusername/insurance-qa-agent/ingestion-service/internal/parser"
)

// MockParser는 테스트용 가짜 Parser다.
type MockParser struct {
	Text string
	Err  error
}

func (m *MockParser) Extract(_ string) (string, error) {
	return m.Text, m.Err
}

func TestMockParser_Extract(t *testing.T) {
	mock := &MockParser{Text: "보험 약관 제1조 목적 이 약관은..."}
	text, err := mock.Extract("irrelevant.pdf")
	assert.NoError(t, err)
	assert.Equal(t, "보험 약관 제1조 목적 이 약관은...", text)
}

func TestMockParser_ExtractError(t *testing.T) {
	mock := &MockParser{Err: assert.AnError}
	_, err := mock.Extract("bad.pdf")
	assert.Error(t, err)
}

// Parser 인터페이스를 PDFParser가 올바르게 구현하는지 컴파일 타임 확인
var _ parser.Parser = (*parser.PDFParser)(nil)
