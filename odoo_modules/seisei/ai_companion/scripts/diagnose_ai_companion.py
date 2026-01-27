#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI Companion 诊断脚本
在 Odoo shell 中运行此脚本来检查配置

使用方法：
1. 进入 Odoo shell: docker exec -it odoo-web odoo shell -d your_database
2. 复制粘贴此脚本内容
3. 查看输出结果
"""

def diagnose_ai_companion():
    """诊断 AI Companion 配置"""
    print("=" * 60)
    print("AI Companion 配置诊断")
    print("=" * 60)
    
    # 获取环境
    env = env  # 在 Odoo shell 中，env 是全局变量
    
    issues = []
    checks = []
    
    # 检查 1: AI 是否启用
    print("\n[1] 检查 AI Companion 是否启用...")
    params = env['ir.config_parameter'].sudo()
    enabled = params.get_param('ai_companion.dify_enabled', default='False')
    is_enabled = enabled in ('True', 'true', '1', True)
    checks.append(('AI Companion 已启用', is_enabled))
    if not is_enabled:
        issues.append('❌ AI Companion 未启用。请在 Settings > General Settings > AI Companion 中启用。')
        print("   ❌ 未启用")
    else:
        print("   ✅ 已启用")
    
    # 检查 2: AI Partner 是否存在
    print("\n[2] 检查 AI Assistant Partner...")
    try:
        ai_partner = env.ref('ai_companion.partner_ai_assistant', raise_if_not_found=False)
        if not ai_partner:
            ai_partner = env['res.partner'].search([('name', '=', 'AI Assistant')], limit=1)
        
        checks.append(('AI Assistant Partner 存在', bool(ai_partner)))
        if ai_partner:
            print(f"   ✅ 找到 AI Assistant Partner (ID: {ai_partner.id}, Name: {ai_partner.name})")
        else:
            issues.append('❌ AI Assistant Partner 未找到。请检查模块是否正确安装。')
            print("   ❌ 未找到")
    except Exception as e:
        issues.append(f'❌ 查找 AI Partner 时出错: {str(e)}')
        print(f"   ❌ 错误: {str(e)}")
        ai_partner = None
    
    # 检查 3: API Key
    print("\n[3] 检查 Dify API Key...")
    api_key = params.get_param('ai_companion.dify_api_key', default='')
    checks.append(('Dify API Key 已配置', bool(api_key)))
    if api_key:
        print(f"   ✅ API Key 已配置 (长度: {len(api_key)} 字符)")
    else:
        issues.append('❌ Dify API Key 未配置。请在 Settings > General Settings > AI Companion 中配置。')
        print("   ❌ 未配置")
    
    # 检查 4: Base URL
    print("\n[4] 检查 Dify Base URL...")
    base_url = params.get_param('ai_companion.dify_base_url', default='')
    checks.append(('Dify Base URL 已配置', bool(base_url)))
    if base_url:
        print(f"   ✅ Base URL: {base_url}")
        if '13.114.99.38:5001' not in base_url:
            issues.append(f'⚠️  Base URL 可能不正确。建议使用: http://13.114.99.38:5001/v1')
            print("   ⚠️  可能不正确")
    else:
        issues.append('❌ Dify Base URL 未配置。')
        print("   ❌ 未配置")
    
    # 检查 5: 测试 API 连接
    print("\n[5] 测试 Dify API 连接...")
    if api_key and base_url:
        try:
            import requests
            # 准备 URL
            if '/v1' not in base_url:
                url = f"{base_url.rstrip('/')}/v1/chat-messages"
            else:
                url = f"{base_url.rstrip('/')}/chat-messages"
            
            headers = {
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            }
            
            payload = {
                "inputs": {},
                "query": "测试",
                "response_mode": "blocking",
                "user": "diagnostic_test",
            }
            
            response = requests.post(url, headers=headers, json=payload, timeout=10)
            if response.status_code == 200:
                print("   ✅ API 连接成功")
                checks.append(('Dify API 连接', True))
            else:
                print(f"   ❌ API 连接失败 (HTTP {response.status_code})")
                print(f"   响应: {response.text[:200]}")
                issues.append(f'❌ Dify API 连接失败 (HTTP {response.status_code})')
                checks.append(('Dify API 连接', False))
        except requests.exceptions.ConnectionError:
            print("   ❌ 无法连接到 Dify API (连接错误)")
            issues.append('❌ 无法连接到 Dify API。请检查网络连接和 Base URL。')
            checks.append(('Dify API 连接', False))
        except Exception as e:
            print(f"   ❌ API 测试失败: {str(e)}")
            issues.append(f'❌ API 测试失败: {str(e)}')
            checks.append(('Dify API 连接', False))
    else:
        print("   ⏭️  跳过（API Key 或 Base URL 未配置）")
        checks.append(('Dify API 连接', None))
    
    # 检查 6: 检查频道中的 AI Partner
    print("\n[6] 检查 Discuss 频道中的 AI Assistant...")
    if ai_partner:
        try:
            channels = env['discuss.channel'].search([], limit=10)
            channels_with_ai = []
            channels_without_ai = []
            
            for channel in channels:
                # 检查 channel_partner_ids
                has_ai = False
                if hasattr(channel, 'channel_partner_ids'):
                    has_ai = ai_partner.id in channel.channel_partner_ids.ids
                elif hasattr(channel, 'channel_member_ids'):
                    has_ai = ai_partner.id in channel.channel_member_ids.mapped('partner_id').ids
                else:
                    # 直接查询
                    member = env['discuss.channel.member'].search([
                        ('channel_id', '=', channel.id),
                        ('partner_id', '=', ai_partner.id)
                    ], limit=1)
                    has_ai = bool(member)
                
                if has_ai:
                    channels_with_ai.append(channel.name)
                else:
                    channels_without_ai.append(channel.name)
            
            print(f"   📊 检查了 {len(channels)} 个频道")
            print(f"   ✅ {len(channels_with_ai)} 个频道包含 AI Assistant")
            print(f"   ❌ {len(channels_without_ai)} 个频道不包含 AI Assistant")
            
            if channels_without_ai:
                print(f"   缺少 AI Assistant 的频道: {', '.join(channels_without_ai[:5])}")
                if len(channels_without_ai) > 5:
                    print(f"   ... 还有 {len(channels_without_ai) - 5} 个频道")
        except Exception as e:
            print(f"   ⚠️  检查频道时出错: {str(e)}")
    
    # 总结
    print("\n" + "=" * 60)
    print("诊断总结")
    print("=" * 60)
    
    print("\n检查结果:")
    for check_name, status in checks:
        icon = "✅" if status is True else "❌" if status is False else "⏭️"
        print(f"  {icon} {check_name}")
    
    if issues:
        print("\n需要修复的问题:")
        for issue in issues:
            print(f"  {issue}")
    else:
        print("\n✅ 所有检查通过！AI Companion 应该可以正常工作。")
    
    print("\n" + "=" * 60)
    
    return {
        'checks': checks,
        'issues': issues,
        'ai_partner': ai_partner,
    }


# 在 Odoo shell 中运行
if __name__ == '__main__':
    # 这个脚本主要在 Odoo shell 中使用
    # 在 shell 中，直接调用 diagnose_ai_companion()
    pass


