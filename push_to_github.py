#!/usr/bin/env python3
"""
Git 推送脚本 - 将代码推送到 GitHub 仓库
使用环境变量 GITHUB_TOKEN 进行认证
"""

import git
import os
import getpass
from datetime import datetime

# ====== 配置区域 ======
REPO_URL = "https://github.com/AthenDrakomin-hub/Digital-lottery-system.git"
REPO_PATH = "/workspace/projects"

# Git 用户配置
GIT_USER_NAME = "AthenDrakomin"
GIT_USER_EMAIL = "athendrakomin@users.noreply.github.com"

# 提交信息模板
COMMIT_MESSAGE = f"feat: 自动提交 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
# =====================


def main():
    print("=" * 50)
    print("Git 推送脚本")
    print("=" * 50)
    print()

    # 1. 获取 Token
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        print("⚠️  环境变量 GITHUB_TOKEN 未设置")
        token = getpass.getpass("请输入你的 GitHub Token（输入时不显示）: ")
    
    if not token:
        print("❌ 错误：未提供 GitHub Token")
        return False

    print("✅ 已获取 GitHub Token")

    # 2. 打开仓库
    try:
        repo = git.Repo(REPO_PATH)
        print(f"✅ 已打开仓库: {REPO_PATH}")
        print(f"   当前分支: {repo.active_branch.name}")
    except Exception as e:
        print(f"❌ 打开仓库失败: {e}")
        return False

    # 3. 配置用户信息
    try:
        with repo.config_writer() as git_config:
            git_config.set_value("user", "name", GIT_USER_NAME)
            git_config.set_value("user", "email", GIT_USER_EMAIL)
        print(f"✅ 已配置 Git 用户: {GIT_USER_NAME}")
    except Exception as e:
        print(f"⚠️  配置用户信息失败: {e}")

    # 4. 查看当前状态
    print()
    print("-" * 30)
    print("仓库状态:")
    print(f"  未跟踪文件: {len(repo.untracked_files)} 个")
    print(f"  已修改文件: {len([item.a_path for item in repo.index.diff(None)])} 个")
    
    if repo.untracked_files:
        print("  新文件列表:")
        for f in repo.untracked_files[:5]:
            print(f"    - {f}")
        if len(repo.untracked_files) > 5:
            print(f"    ... 还有 {len(repo.untracked_files) - 5} 个文件")

    # 5. 添加所有更改
    print()
    print("-" * 30)
    try:
        repo.git.add(A=True)
        print("✅ 已添加所有更改到暂存区")
    except Exception as e:
        print(f"❌ 添加文件失败: {e}")
        return False

    # 6. 提交更改
    try:
        if repo.is_dirty() or repo.untracked_files:
            repo.index.commit(COMMIT_MESSAGE)
            print(f"✅ 已提交: {COMMIT_MESSAGE}")
        else:
            print("ℹ️  没有需要提交的更改")
    except Exception as e:
        print(f"⚠️  提交状态: {e}")

    # 7. 设置远程仓库
    try:
        if "origin" not in [remote.name for remote in repo.remotes]:
            repo.create_remote("origin", REPO_URL)
            print("✅ 已添加远程仓库 origin")
        else:
            print("✅ 远程仓库 origin 已存在")
    except Exception as e:
        print(f"⚠️  设置远程仓库: {e}")

    # 8. 推送到 GitHub
    print()
    print("-" * 30)
    print("正在推送到 GitHub...")
    
    try:
        remote = repo.remote(name="origin")
        
        # 使用带 Token 的 URL 进行推送
        push_url = REPO_URL.replace("https://", f"https://{token}@")
        original_url = list(remote.urls)[0]
        remote.set_url(push_url)

        # 执行推送
        branch_name = repo.active_branch.name
        push_info = remote.push(refspec=f"{branch_name}:{branch_name}")
        
        # 检查推送结果
        if push_info[0].flags & push_info[0].ERROR:
            print(f"❌ 推送失败: {push_info[0].summary}")
            success = False
        else:
            print(f"✅ 推送成功！")
            print(f"   分支: {branch_name}")
            print(f"   仓库: {REPO_URL}")
            success = True
            
    except git.exc.GitCommandError as e:
        print(f"❌ Git 命令错误: {e}")
        success = False
    except Exception as e:
        print(f"❌ 推送异常: {e}")
        success = False
    finally:
        # 恢复原始 URL（安全措施）
        try:
            remote.set_url(original_url)
        except:
            pass

    # 9. 完成
    print()
    print("=" * 50)
    if success:
        print("🎉 推送完成！")
        print(f"   查看仓库: https://github.com/AthenDrakomin-hub/Digital-lottery-system")
    else:
        print("❌ 推送失败，请检查错误信息")
    print("=" * 50)
    
    return success


if __name__ == "__main__":
    main()
