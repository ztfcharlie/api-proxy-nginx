import base64
import os
import sys

def main():
    # 用户指定的文件名
    filename = 'vedio.mp4'
    
    # 确定文件路径：相对于脚本所在目录查找
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(script_dir, filename)
    
    print(f"--- 视频 Base64 编码工具 ---")
    print(f"脚本目录: {script_dir}")
    print(f"目标文件: {file_path}")

    # 检查文件是否存在
    if not os.path.exists(file_path):
        print(f"\n❌ 错误: 在当前目录下找不到文件 '{filename}'")
        print(f"请确认 '{filename}' 文件确实位于: {current_dir}")
        return

    try:
        # 1. 读取文件
        print(f"\n正在读取 '{filename}' ...", end='', flush=True)
        file_size = os.path.getsize(file_path)
        with open(file_path, 'rb') as video_file:
            video_data = video_file.read()
        print(f" 完成 (大小: {file_size / 1024 / 1024:.2f} MB)")

        # 2. 编码
        print("正在进行 Base64 编码...", end='', flush=True)
        base64_data = base64.b64encode(video_data)
        base64_str = base64_data.decode('utf-8')
        print(" 完成")

        # 3. 输出到文件 (因为Base64太长，打印到控制台会卡死)
        output_filename = f"{filename}.b64.txt"
        output_path = os.path.join(script_dir, output_filename)
        
        print(f"正在保存结果到 '{output_filename}' ...", end='', flush=True)
        with open(output_path, 'w') as f:
            f.write(base64_str)
        print(" 完成")

        print(f"\n✅ 成功! Base64 字符串已保存至: {output_path}")
        print(f"字符长度: {len(base64_str)}")
        print(f"预览(前50字符): {base64_str[:50]}...")

    except MemoryError:
        print("\n❌ 内存不足: 视频文件过大，无法一次性载入内存进行编码。")
    except Exception as e:
        print(f"\n❌ 发生未预期的错误: {e}")

if __name__ == "__main__":
    main()
