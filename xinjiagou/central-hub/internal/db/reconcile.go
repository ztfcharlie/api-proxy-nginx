package db

import (
	"fmt"
	"strings"
)

// ReconcileAgents 执行一次对账：将未结转的流水累加到 Agent 余额
// 返回处理的条数和错误
func (d *DB) ReconcileAgents() (int, error) {
	tx, err := d.conn.Begin()
	if err != nil {
		return 0, err
	}
	// 无论成功失败，确保退出时 rollback (如果已 commit 则无影响)
	defer tx.Rollback()

	// 1. 锁定待处理的行 (Pessimistic Lock)
	// 限制 1000 条，防止长事务锁死表
	rows, err := tx.Query("SELECT req_id, agent_id, agent_income FROM transactions WHERE is_settled = 0 LIMIT 1000 FOR UPDATE")
	if err != nil {
		return 0, fmt.Errorf("lock rows failed: %v", err)
	}
	defer rows.Close()

	// 2. 内存聚合 (Reduce)
	incomeMap := make(map[string]float64)
	var reqIDs []string

	for rows.Next() {
		var reqID, agentID string
		var income float64
		if err := rows.Scan(&reqID, &agentID, &income); err != nil {
			return 0, err
		}
		
		incomeMap[agentID] += income
		reqIDs = append(reqIDs, fmt.Sprintf("'%s'", reqID)) // 加上引号，防SQL注入风险虽小但要注意
	}

	if len(reqIDs) == 0 {
		return 0, nil // 没有新数据
	}

	// 3. 批量更新 Agent 余额
	for agentID, totalIncome := range incomeMap {
		// 这里不需要锁 agent 表，因为事务隔离级别会处理，或者 UPDATE 本身就是原子锁
		_, err := tx.Exec("UPDATE agents SET balance = balance + ? WHERE id = ?", totalIncome, agentID)
		if err != nil {
			return 0, fmt.Errorf("update agent %s failed: %v", agentID, err)
		}
	}

	// 4. 标记为已结转
	// UPDATE transactions SET is_settled = 1 WHERE req_id IN ('id1', 'id2'...)
	query := fmt.Sprintf("UPDATE transactions SET is_settled = 1 WHERE req_id IN (%s)", strings.Join(reqIDs, ","))
	if _, err := tx.Exec(query); err != nil {
		return 0, fmt.Errorf("mark settled failed: %v", err)
	}

	// 5. 提交事务 (原子生效)
	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return len(reqIDs), nil
}