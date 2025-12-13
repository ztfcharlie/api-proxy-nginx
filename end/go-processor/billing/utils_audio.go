package billing

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"strings"

	"github.com/tcolgate/mp3"
	"github.com/youpy/go-wav"
)

// Helper to parse multipart form and extract the first file
func ParseFirstFile(reqBody []byte, contentType string) ([]byte, string, error) {
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil || !strings.HasPrefix(mediaType, "multipart/") {
		return nil, "", errors.New("invalid content type")
	}

	boundary, ok := params["boundary"]
	if !ok {
		return nil, "", errors.New("no boundary in content type")
	}

	reader := multipart.NewReader(bytes.NewReader(reqBody), boundary)
	
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, "", err
		}

		// [Fix] Accept any file field, not just "file"
		if part.FileName() != "" {
			fileData, err := io.ReadAll(part)
			return fileData, part.FileName(), err
		}
	}

	return nil, "", errors.New("no file found in request")
}

// Calculate audio duration in seconds
func GetAudioDuration(data []byte, filename string) (float64, error) {
	filename = strings.ToLower(filename)
	
	if strings.HasSuffix(filename, ".mp3") {
		return getMp3Duration(data)
	} else if strings.HasSuffix(filename, ".wav") {
		return getWavDuration(data)
	}
	
	// TODO: Add more formats
	return 0, fmt.Errorf("unsupported audio format: %s", filename)
}

func getMp3Duration(data []byte) (float64, error) {
	d := mp3.NewDecoder(bytes.NewReader(data))
	var duration float64
	var f mp3.Frame
	var skipped int

	for {
		if err := d.Decode(&f, &skipped); err != nil {
			if err == io.EOF {
				break
			}
			return duration, err
		}
		duration += f.Duration().Seconds()
	}
	return duration, nil
}

func getWavDuration(data []byte) (float64, error) {
	reader := bytes.NewReader(data)
	w := wav.NewReader(reader)
	duration, err := w.Duration()
	if err != nil {
		return 0, err
	}
	return duration.Seconds(), nil
}
