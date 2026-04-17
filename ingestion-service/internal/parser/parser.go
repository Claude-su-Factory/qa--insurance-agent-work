package parser

import (
	"bytes"

	"github.com/dslipak/pdf"
)

// Parser는 PDF에서 텍스트를 추출하는 인터페이스다.
type Parser interface {
	Extract(path string) (string, error)
}

type PDFParser struct{}

func New() Parser {
	return &PDFParser{}
}

func (p *PDFParser) Extract(path string) (string, error) {
	r, err := pdf.Open(path)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	b, err := r.GetPlainText()
	if err != nil {
		return "", err
	}
	if _, err := buf.ReadFrom(b); err != nil {
		return "", err
	}
	return buf.String(), nil
}
