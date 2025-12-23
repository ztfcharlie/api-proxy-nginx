package providers

import (
	"bytes"
	"context"
	"crypto/sha256"
	"edge-agent/internal/protocol"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/credentials"
)

type AWSAdapter struct{}

func (a *AWSAdapter) RewriteRequest(req *http.Request, instance *protocol.InstanceConfig) error {
	// Mock: Parse AK/SK from ID "ACCESS_KEY:SECRET_KEY:REGION"
	// In production, load from secure file using instance.ID
	parts := strings.Split(instance.ID, ":")
	if len(parts) < 3 {
		return fmt.Errorf("invalid AWS credentials format in ID, expected AK:SK:REGION")
	}
	ak, sk, region := parts[0], parts[1], parts[2]

	credsProvider := credentials.NewStaticCredentialsProvider(ak, sk, "")
	creds, err := credsProvider.Retrieve(context.Background())
	if err != nil {
		return err
	}
	
	// Determine Service Name based on Host
	// bedrock-runtime.us-east-1.amazonaws.com -> bedrock
	serviceName := "bedrock"

	signer := v4.NewSigner()

	// Calculate Payload Hash (Required for SigV4)
	var payloadHash string
	if req.Body != nil {
		bodyBytes, err := io.ReadAll(req.Body)
		if err != nil {
			return err
		}
		// Restore Body
		req.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
		
		hash := sha256.Sum256(bodyBytes)
		payloadHash = hex.EncodeToString(hash[:])
	} else {
		hash := sha256.Sum256([]byte{})
		payloadHash = hex.EncodeToString(hash[:])
	}

	// Sign the request
	// This adds Authorization, X-Amz-Date, X-Amz-Content-Sha256 headers
	signErr := signer.SignHTTP(context.Background(), creds, req, payloadHash, serviceName, region, time.Now())
	return signErr
}

func (a *AWSAdapter) GetSniffer() Sniffer {
	return &AWSSniffer{}
}

type AWSSniffer struct {
	usage *protocol.Usage
}

func (s *AWSSniffer) Write(p []byte) (n int, err error) {
	// AWS Bedrock EventStream is binary.
	// Implementing a full EventStream parser is complex.
	// For MVP, we can fallback to Byte Counting or just pass-through.
	// TODO: Implement EventStream decoder
	return len(p), nil
}

func (s *AWSSniffer) GetUsage() *protocol.Usage {
	return s.usage
}